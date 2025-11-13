// EDIT 2025-11-13 for rehosting on my personal GitHub: The Serialise and Deserialise functions were
// not written by me. Everything in this repository is but a part of the team software engineering project
// in university between myself (https://github.com/NotAuhrii), Richard Ball (https://github.com/kicomoco)
// who wrote the backend, and Matthew Nicholls (https://github.com/40046873), who wrote the serialisation
// and deserialisation functions, and contributed greatly to interop communication.

// Please note that this was written with a strict deadline, and has since been untouched aside from this
// comment addition. There were many things that could have been streamlined in hindsight, and many errors
// would have been avoided development had we had the time to properly document our thought processes.

// Original final commit: May 28th, 2024 - 21:31 UTC

// ####################################################
// ### EVERYTHING BELOW THIS IS THE ORIGINAL SCRIPT ###
// ####################################################

// NOTE: Chrome/Chromium and Safari disallow all local file AJAX requests.
// https://stackoverflow.com/questions/8456538/origin-null-is-not-allowed-by-access-control-allow-origin
// tl;dr use the following command in the project directory to host the page on a server for testing:
// 		python -m http.server 1337
// Access the page at http://localhost:1337/index.html
// Also note that script and CSS changes will require a cleared page cache (CTRL+F5) to take effect.

// TODO: Support CSS scale for panning and drag/drop.
// TODO: The 'edited' flag (nav.js) is set naïvely, on any node title/socket click or node create/delete.
// Ideally only set it when a change has actually been made.
// TODO: Multi-select dragging. May require supporting grabbedElement and grabDummy as arrays.
// TODO: Prompt user to save to/load from local device instead of just the ESP.

// Yes, I spent an inordinate amount of time on the page design before implementation, but having visual
// feedback for element states allows me to rapidly narrow down problems when debugging.

var canvas = document.getElementById("canvas");
var nodeRoot = document.getElementById("root"); // Node objects (not HTML elements) go in here!
var bg = document.getElementById("canvas-background");
var tooltip = document.getElementById("tooltip");

var nodes = [];
var grabbedElement = null;
var grabbedPosition = new Vector2();
var grabbedSocket = null;
var grabDummy = null;
var shiftHeld = false;
var lastID = -1;

Init(); // See nav.js

// `nodeType` can either be a string matching the name of a node type specified in nodes.json, or a node
// 		object from the `nodes` array, for loading from an existing configuration file.
// `hold` is an optional boolean; if passed as 'true', the function will skip adding the node to the canvas.
// Note that the new node is returned regardless, so it can be appended to the canvas later.
function CreateNode(nodeType, hold) {
	// Abort if the node or category data hasn't been loaded yet.
	if (!(CATEGORIES && NODE_TYPES)) {
		console.warn("categories.json and/or nodes.json not yet loaded! Aborting node creation.");
		return;
	}
	edited = true;
	var nodeBaseData = typeof nodeType === "object" ? NODE_TYPES[nodeType["node-type"]] : NODE_TYPES[nodeType];

	var newNode = document.createElement("div");
	newNode.classList.add("node");

	var title = document.createElement("h1");
	if (nodeBaseData && CATEGORIES[nodeBaseData.category]) {
		var categoryData = CATEGORIES[nodeBaseData.category];
		title.style.backgroundColor = categoryData["colour"];
		title.style.color = categoryData["text-colour"];
	}
	title.innerText = nodeType;
	newNode.appendChild(title);

	var miscOptions = document.createElement("button");
	miscOptions.classList.add("misc-options", "danger"); // Danger class is TEMPORARY while we use this as the delete.
	var miscImg = document.createElement("img");
	miscImg.src = "images/icons/trash.svg";
	miscOptions.appendChild(miscImg);
	newNode.appendChild(miscOptions);

	if (nodeBaseData) {
		var nodeData;
		if (typeof nodeType === "object") {
			nodeData = JSON.parse(JSON.stringify(nodeType));
			lastID = Math.max(lastID, nodeData["id"]);
		} else {
			lastID++;
			nodeData = JSON.parse(JSON.stringify(nodeBaseData));
			nodeData["node-type"] = nodeType;
			nodeData["id"] = lastID;
			nodeData["element"] = newNode; // For internal use only! Lookup entry for finding the node's HTML element.
		}
		newNode.setAttribute("node-id", nodeData["id"]); // Reverse lookup, for getting the nodes index from the HTML element.
		nodes.push(nodeData);

		// Create I/O fields and socket containers.
		if (nodeBaseData.sockets) {
			// Count index for socket IDs
			var n = 0;
			for (const fieldName in nodeBaseData.sockets) {
				let fieldData = nodeBaseData.sockets[fieldName];
				var fieldContainer = CreateField(fieldName);

				let fieldSocket = document.createElement("div");
				fieldSocket.classList.add("socket", fieldData.direction == "in" ? "left" : "right");
				fieldSocket.setAttribute("socket-id", n);
				n++;
				fieldContainer.appendChild(fieldSocket);
				let socketPin = document.createElement("div");
				socketPin.classList.add("socket-pin");
				socketPin.classList.add(fieldData.type);
				fieldSocket.appendChild(socketPin);
				nodes[lastID].sockets[fieldName].element = fieldSocket;

				// DO NOT USE nodeData BEYOND INITIAL CREATION. It will not reflect the live state in the nodes array.
				// Use newNode.getAttribute("node-id") for the updated node ID, and use that as an index in nodes for updated data.

				// Socket mouse down event, for node socket linking.
				fieldSocket.onmousedown = function(event) {
					if (event.button != 0) { return; }
					edited = true;
					var thisSocket = SocketFromElement(newNode, fieldName);

					// If this is an input and already has an existing wire, edit that wire instead.
					if (thisSocket.direction == "in" && thisSocket.wires && thisSocket.wires.length > 0) {
						while (thisSocket.wires.length > 1) { // First remove all but the first link if more than one somehow exists.
							DeleteLink(newNode.getAttribute("node-id"), fieldName, 1);
						}

						var linkEnds = GetLinkEnds(newNode.getAttribute("node-id"), fieldName, 0);
						grabbedElement = linkEnds.startSocket.element.getElementsByClassName("socket-pin")[0];
						grabbedSocket = new NodeSocket(linkEnds.startNode.element, linkEnds.startSocketName);
						grabDummy = thisSocket.wires[0].element;
						grabDummy.classList.add("link-dummy");
						DeleteLink(newNode.getAttribute("node-id"), fieldName, 0);
						socketPin.classList.add("linking");
					} else { // Else, grab this socket and start drawing from it.
						grabbedElement = socketPin;
						grabbedSocket = new NodeSocket(newNode, fieldName);
					}

					grabbedElement.classList.add("linking");

					// Start drawing a link line from this element to the mouse.
					var startPosition = CentreToVector2(grabbedElement);
					var endPosition = grabbedElement == socketPin ? new Vector2(event.clientX, event.clientY) : CentreToVector2(socketPin);
					var linkLine = DrawLine(startPosition, endPosition, grabDummy && grabDummy.classList.contains("link-dummy") ? grabDummy : null);
					grabDummy = linkLine;
					linkLine.classList.add("link-dummy");

					event.stopPropagation();
					UpdateCursor();
				};

				fieldSocket.onmouseenter = function(event) {
					tooltip.style.display = "block";
					tooltip.innerText = "";
					var tipType = document.createElement("span");
					tipType.classList.add("misc-info");
					tipType.innerText = fieldData.type.toUpperCase();
					tooltip.appendChild(tipType);

					if (grabbedSocket && grabbedElement != socketPin) {
						var firstSocket = SocketFromElement(
							grabbedSocket.nodeElement,
							grabbedSocket.socketName
						);
						var thisSocket = SocketFromElement(newNode, fieldName);
						socketPin.classList.add("linking");

						var startPosition = CentreToVector2(firstSocket.element);
						var endPosition = CentreToVector2(thisSocket.element);
						var linkLine = DrawLine(startPosition, endPosition, grabDummy && grabDummy.classList.contains("link-dummy") ? grabDummy : null);
						grabDummy = linkLine;
						linkLine.classList.add("link-dummy");

						// Highlight as invalid and abort if the two sockets are on the same node, or are the same direction.
						if (grabbedSocket.nodeID == newNode.getAttribute("node-id") || firstSocket.direction == thisSocket.direction) {
							grabbedElement.classList.add("invalid-link");
							socketPin.classList.add("invalid-link");
							if (grabDummy && grabDummy.classList.contains("link-dummy")) { grabDummy.classList.add("invalid-link"); }
							return; // Do we actually need to abort? Keep for now, just in case we extend this.
						}
					}
				};

				fieldSocket.onmouseleave = function() {
					tooltip.style.display = "none";

					if (grabbedElement != socketPin) {
						socketPin.classList.remove("linking");
						if (grabbedElement) { grabbedElement.classList.remove("invalid-link"); }
						socketPin.classList.remove("invalid-link");
						if (grabDummy && grabDummy.classList.contains("link-dummy")) { grabDummy.classList.remove("invalid-link"); }
					}
				};

				fieldSocket.onmouseup = function(event) {
					if (event.button != 0) { return; }
					if (grabbedSocket) { CreateLink(grabbedSocket.nodeID, grabbedSocket.socketName, newNode.getAttribute("node-id"), fieldName); }
				};

				newNode.appendChild(fieldContainer);
			}
		}

		// Create config fields.
		if (nodeBaseData.config) {
			for (const fieldName in nodeBaseData.config) {
				let fieldData = nodeBaseData.config[fieldName];
				var fieldContainer = CreateField(fieldName);
				var fieldInput;

				// Add input elements depending on config type.
				if (fieldData.type == "float" || fieldData.type == "int") { // It's a number.
					fieldInput = document.createElement("input");
					fieldInput.dataset.configname = fieldName;
					fieldInput.type = "number";
					fieldInput.value = fieldData.default ? fieldData.default : 0;

					// Explicit != null checks, as the step value could be 0.
					fieldInput.setAttribute("step", fieldData.step != null ? fieldData.step : (fieldData.type == "float" ? 0.1 : 1));
					if (fieldData.min != null) { fieldInput.setAttribute("min", fieldData.min); }
					if (fieldData.max != null) { fieldInput.setAttribute("max", fieldData.max); }

					// Waits for the user to release focus, used to clamp values to ranges.
					fieldInput.onchange = function() {
						if (fieldData.min != null && fieldInput.value < fieldData.min) { fieldInput.value = fieldData.min; }
						if (fieldData.max != null && fieldInput.value > fieldData.max) { fieldInput.value = fieldData.max; }
						fieldInput.classList.remove("invalid-input");
					}
				} else if (fieldData.type == "enum") { // It's an enum, create a dropdown.
					fieldInput = document.createElement("select");
					fieldInput.dataset.configname = fieldName;

					for (var i = 0; i < fieldData.values.length; i++) {
						var option = document.createElement("option");
						option.value = fieldData.values[i];
						option.innerText = fieldData.display ? fieldData.display[i] : fieldData.values[i];
						fieldInput.appendChild(option);
					}
				} else if (fieldData.type == "rangemap") {
					var addButton = document.createElement("button");
					addButton.classList.add("corner-button");
					addButton.innerText = "ADD";
					var addImage = document.createElement("img");
					addImage.src = "images/icons/plus.svg";
					addButton.appendChild(addImage);
					fieldContainer.appendChild(addButton);

					var listContainer = document.createElement("div");
					listContainer.classList.add("range-map");
					fieldContainer.appendChild(listContainer);

					function NewRange() { // Yes, this is very evil, but we're short on time.
						var currentFieldData = nodes[newNode.getAttribute("node-id")].config[fieldName];
						if (!currentFieldData.values) {
							currentFieldData.values = [];
						} else if (currentFieldData.values.length >= MAX_RANGEMAP_FIELDS) {
							return;
						}

						var rangeContainer = document.createElement("div");
						rangeContainer.classList.add("range");
						var minBound = document.createElement("input");
						minBound.placeholder = "Min";
						minBound.type = "number";
						minBound.dataset.configname = "From";
						rangeContainer.appendChild(minBound);
						var maxBound = document.createElement("input");
						maxBound.placeholder = "Max";
						maxBound.type = "number";
						maxBound.dataset.configname = "To";
						rangeContainer.appendChild(maxBound);
						var outValue = document.createElement("input");
						outValue.placeholder = "Out";
						outValue.type = "number";
						outValue.dataset.configname = "Out";
						rangeContainer.appendChild(outValue);

						var deleteButton = document.createElement("button");
						deleteButton.classList.add("danger");
						var deleteIcon = document.createElement("img");
						deleteIcon.src = "images/icons/trash.svg";
						deleteButton.appendChild(deleteIcon);
						rangeContainer.appendChild(deleteButton);

						// Add this to the values list.
						currentFieldData.values.push({"min": 0, "max": 0, "out": 0, "element": rangeContainer});
						
						// Prevent node selection on mouse down.
						deleteButton.onmousedown = function(event) { event.stopPropagation(); }
						// Delete this range when clicked.
						deleteButton.onclick = function() {
							// Don't delete it if it's the only range.
							if (!(currentFieldData.values.length > 1)) { return; }
							
							for (var i = 0; i < currentFieldData.values.length; i++) {
								if (currentFieldData.values[i].element == rangeContainer) {
									currentFieldData.values.splice(i, 1);
									rangeContainer.remove();
									break;
								}
							}
						}

						listContainer.appendChild(rangeContainer);
					}

					NewRange();

					newNode.NewRange = NewRange; // Hack added to be able to call node.NewRange() in the deserialiser to create more rows

					// Prevent highlighting the node when adding new ranges.
					addButton.onmousedown = function(event) { event.stopPropagation(); }
					// Add a new range when clicking the button.
					addButton.onclick = NewRange;
				} else {
					// We either don't know what this is, or it's unsupported.
					console.warn(`${fieldName} is unhandled type '${fieldData.type}'!`);
				}

				if (fieldInput) {
					// Updates instantly per value change or keypress, no focus release required.
					fieldInput.oninput = function() {
						edited = true;

						if (fieldInput.type == "number") {
							var valid = true;
							if (fieldData.min != null && fieldInput.value < fieldData.min) { valid = false; }
							if (fieldData.max != null && fieldInput.value > fieldData.max) { valid = false; }

							if (valid) {
								fieldInput.classList.remove("invalid-input");
							} else {
								fieldInput.classList.add("invalid-input");
							}
						}
					}
					fieldContainer.appendChild(fieldInput);
				}
				newNode.appendChild(fieldContainer);
			}
		}
	}

	// Finally, add the new node to the canvas (if not withheld) and push it to the active node list.
	if (!hold) {
		root.appendChild(newNode);
	}

	// Title mouse down event, for dragging the node around.
	title.onmousedown = function(event) {
		if (event.button != 0) { return; }
		edited = true;

		grabbedElement = newNode;
		grabbedElement.classList.add("grabbed");
		SelectNode(newNode, true);

		CreateDummy(newNode);
		event.stopPropagation();
		UpdateCursor();
	};

	// TEMPORARY. Change miscOptions to the name of the delete button, should we implement the drop-down boxes.
	miscOptions.onclick = function() { DeleteNode(newNode); };
	// Allow the user to abort by moving their mouse off the button, instead of dragging the node around.
	miscOptions.onmousedown = function(event) { event.stopPropagation(); };

	// Node selection on mouse down. onclick doesn't feel responsive enough.
	newNode.onmousedown = function(event) {
		if (event.button != 0) { return; }
		SelectNode(newNode);
		event.stopPropagation();
	};

	return newNode;
}

// Creates a link between two node sockets, specified by their node IDs and socket names.
// Note for deserialisation: It might be best to check if a link already exists, as they are stored from both sides.
// This will prevent double-calling; duplication shouldn't be an issue, but it reduces cycles.
// Also note that this requires both node HTML elements exist - when loading a config, create all nodes first.
function CreateLink(firstNodeID, firstSocketName, secondNodeID, secondSocketName) {
	var firstNode = nodes[firstNodeID].element;
	var firstSocket = SocketFromElement(firstNode, firstSocketName);
	var secondNode = nodes[secondNodeID].element;
	var secondSocket = SocketFromElement(secondNode, secondSocketName);

	// Abort if the two sockets are on the same node, or are the same direction.
	if (firstNodeID == secondNodeID || firstSocket.direction == secondSocket.direction ) { return; }

	var isStart = firstSocket.direction == "out";

	// Note for serialisation: Ignore element lookup fields.
	var outNode = isStart ? firstNode : secondNode;
	var outSocketName = isStart ? firstSocketName : secondSocketName;
	var inNode = isStart ? secondNode : firstNode;
	var inSocketName = isStart ? secondSocketName : firstSocketName;
	var outSocket = isStart ? firstSocket : secondSocket;
	var inSocket = isStart ? secondSocket : firstSocket;

	// Clear any existing inputs in the input socket first. One link only per input.
	if (inSocket.wires) {
		while (inSocket.wires.length > 0) {
			DeleteLink(inNode.getAttribute("node-id"), inSocketName, 0);
		}
	} else { inSocket.wires = []; } // Create a wires field for each socket, if it doesn't already exist.
	if (!outSocket.wires) { outSocket.wires = []; }

	var linkLine;
	if (grabDummy && grabDummy.classList.contains("link-dummy")) {
		grabDummy.classList.remove("link-dummy");
		linkLine = grabDummy;
		DrawLine(CentreToVector2(outSocket.element), CentreToVector2(inSocket.element), linkLine);
	} else {
		// Fallback - if link line doesn't already exist, draw a new one.
		linkLine = DrawLine(CentreToVector2(outSocket.element), CentreToVector2(inSocket.element));
	}
	
	// Finally, push the link data to the sockets' wire fields.
	outSocket.wires.push({"to": inNode.getAttribute("node-id"), "socket": inSocketName, "element": linkLine, "toSocketID": inSocket.element.getAttribute("socket-id")});
	inSocket.wires.push({"to": outNode.getAttribute("node-id"), "socket": outSocketName, "element": linkLine, "fromSocketID": outSocket.element.getAttribute("socket-id")});
}


function DeleteLink(nodeID, socketName, linkID) {
	var linkData = nodes[nodeID].sockets[socketName].wires[linkID];

	// First remove the other end, while we have the pointer to it.
	// We can splice with wild abandon here, no sequential IDs to worry about. Linear search for the other side of the link.
	var remoteLinks = nodes[linkData.to].sockets[linkData.socket].wires;
	for (var i = 0; i < remoteLinks.length; i++) {
		if (remoteLinks[i].to == nodeID && remoteLinks[i].socket == socketName) {
			remoteLinks.splice(i, 1);
			i--; // Shift i back, as the next item now occupies the same index.
		}
	}

	// Now clean up this end.
	if (linkData.element) { linkData.element.remove(); }
	nodes[nodeID].sockets[socketName].wires.splice(linkID, 1);
}

function DeleteNode(target) {
	// If it's not a node, don't delete it! Pretty sure this is already protected against elsewhere, but can't be too safe.
	if (!target.classList.contains("node")) { return; }
	edited = true;

	var nodeID = target.getAttribute("node-id");
	var sockets = nodes[nodeID].sockets;
	if (sockets) {
		// Remove all socket links from both ends, and clean up the link lines.
		for (const socketName in sockets) {
			if (sockets[socketName].wires) {
				while (sockets[socketName].wires.length > 0) {
					DeleteLink(nodeID, socketName, 0);
				}
			}
		}
	}

	nodes.splice(nodeID, 1);
	lastID = nodes.length - 1;

	for (var i = 0; i < nodes.length; i++) {
		if (i >= nodeID) { // Update the reverse lookup attributes of the nodes - only need to do this for nodes after.
			nodes[i]["element"].setAttribute("node-id", i);
			nodes[i].id = i;
		}

		// Update any node links to nodes that were after the one we just deleted. They could be anywhere.
		for (const socketName in nodes[i].sockets) {
			var wires = nodes[i].sockets[socketName].wires;
			if (!wires) { continue; }
			for (var wireIndex = 0; wireIndex < wires.length; wireIndex++) {
				if (wires[wireIndex].to > nodeID) { wires[wireIndex].to--; }
			}
		}
	}

	if (grabbedElement == target) {
		grabbedElement = null;
		if (grabDummy) {
			grabDummy.remove();
			grabDummy = null;
		}
	}

	target.remove();
	UpdateCursor();
}

function DeleteSelected() {
	var selected = Array.from(document.getElementsByClassName("selected"));
	for (let i = 0; i < selected.length; i++) {
		DeleteNode(selected[i]);
	}
}

function SelectNode(target, forceSelect) {
	if (!shiftHeld) {
		// Deselect all others if shift isn't held.
		ClearClass("selected", target);
	}
	// Deselect if already selected.
	if (!forceSelect && target.classList.contains("selected")) {
		target.classList.remove("selected");
	} else {
		target.classList.add("selected");
	}
}

// Creates a blank node outline, to show where a node will be placed. Takes an existing node as an argument.
function CreateDummy(prototype) {
	var dummy = document.createElement("div");
	dummy.classList.add("dummy");
	dummy.style.height = document.defaultView.getComputedStyle(prototype).height;

	var nodePosition = prototype.getBoundingClientRect();
	grabbedPosition.set(nodePosition.x + GRID_SIZE / 2, nodePosition.y + GRID_SIZE / 2);

	var canvasPosition = canvas.getBoundingClientRect();
	dummy.style.left = Math.floor((grabbedPosition.x - canvasPosition.x) / GRID_SIZE) * GRID_SIZE + "px";
	dummy.style.top = Math.floor((grabbedPosition.y - canvasPosition.y) / GRID_SIZE) * GRID_SIZE + "px";

	grabDummy = dummy;
	root.appendChild(dummy);
}

saveButton.onclick = function() { 
	Serialise();
}

// Convert the nodes array into a JSON config file.
// Only retain what's relevant to the firmware and the editor (node positions, etc).
// Drop orphan nodes? The user may want to save a work in progress.
function Serialise() {
	// Prevent saving an empty project
	if (nodes.length == 0) {
		alert("No nodes to save.");
		return;
	}

	var serialised = { chain: [] };
	for (var node of nodes) {
		var nodeData = {
			id: node["id"],
			type: node["node-type"],
			coordinates: {
				x: Math.floor((node.element.getBoundingClientRect().x - canvas.getBoundingClientRect().x) / GRID_SIZE),
				y: Math.floor((node.element.getBoundingClientRect().y - canvas.getBoundingClientRect().y) / GRID_SIZE)
			},
			wires: [],
			config: {}
		};

		// Get the wires for the node
		var sockets = node.sockets;
		for (var socketName in sockets) {
			// If socket is receiving, don't record it (only record outputs)
			if (sockets[socketName].direction === "in") continue;
			
			if (sockets[socketName].wires) {
				for (var link of sockets[socketName].wires) {
					nodeData.wires.push({
						to: parseFloat(link.to),
						input: parseFloat(link.toSocketID)+1 // Config.json index starts from 1 for Human readability
					});
				}
			}
		}

		// Get the config values for the node
		var configValues = node.element.querySelectorAll('[data-configname]');
		if (nodeData.type == "Range Map") {
			console.log("range map");
			console.log(configValues);
			nodeData.config["Ranges"] = [];
			for (var i = 0; i < configValues.length; i+=3) {
				nodeData.config["Ranges"].push({
					from: parseFloat(configValues[i].value),
					to: parseFloat(configValues[i + 1].value),
					out: parseFloat(configValues[i + 2].value)
				});
			}
		} else if (configValues) {
			for (var value of configValues) {
				nodeData.config[value.dataset.configname] =
					// Only parse numbers
					value.type === 'number' ? parseFloat(value.value) : value.value;
			}
		}

		serialised.chain.push(nodeData);
	}
	console.log(JSON.stringify(serialised));
	saveConfig(JSON.stringify(serialised));
	edited = false;
}

// Load a JSON config file into the nodes array, and create and link the node elements.
// May want to clear the workspace first. Or not, I'm not your mother.
async function Deserialise() {
	await Init();
	var configRequest = await fetch("config.json");
	var json = await configRequest.json();

	/* As the nodes.json stores socket props by key and not in an array
	we need to build an index to be able to get the X socket property */
	var inputSocketIndex = [];
	var outputSocketIndex = [];
	var oldToNewNodeIds = [];

	// Iterate the nodes first to create....link later (can't link to one that hasn't been created yet!)
	for (var i = 0; i < json.chain.length; i++) {
		oldToNewNodeIds[json.chain[i].id] = i;
		
		var nodeSocketIndex = [];
		var noOutputSocket = true;

		for (var socket in NODE_TYPES[json.chain[i].type].sockets) {
			if (NODE_TYPES[json.chain[i].type].sockets[socket].direction == "in") {
				nodeSocketIndex.push(socket);
			} else if (NODE_TYPES[json.chain[i].type].sockets[socket].direction == "out") {
				outputSocketIndex.push(socket);
				noOutputSocket = false;
			}
		}
		if (noOutputSocket) outputSocketIndex.push("NONE");

		var node = CreateNode(json.chain[i].type);
		node.style.left = `${json.chain[i].coordinates.x * GRID_SIZE}px`;
		node.style.top = `${json.chain[i].coordinates.y * GRID_SIZE}px`;

		Object.entries(json.chain[i].config).forEach(([key, value]) => {
			if (NODE_TYPES[json.chain[i].type].config[key].type == "rangemap") {
				var ruleNum = 0;
				value.forEach((ruleObj) => {
					if (ruleNum > 0) {
						node.NewRange();
					}
					var row = node.getElementsByClassName("range");
					row[ruleNum].querySelectorAll(`[data-configname='From']`)[0].value = ruleObj.from;
					row[ruleNum].querySelectorAll(`[data-configname='To']`)[0].value = ruleObj.to;
					row[ruleNum].querySelectorAll(`[data-configname='Out']`)[0].value = ruleObj.out;
					ruleNum++;
				});
			} else {
				node.querySelectorAll(`[data-configname='${key}']`)[0].value = value;
			}
		});

		inputSocketIndex.push(nodeSocketIndex);
	}

	for (var i = 0; i < json.chain.length; i++) {
		for (var l = 0; l < json.chain[i].wires.length; l++) {
			var fromNode = i;
			var fromSocket = outputSocketIndex[i];
			var toNode = oldToNewNodeIds[json.chain[i].wires[l].to];
			var toSocket = inputSocketIndex[toNode][json.chain[i].wires[l].input - 1];
			CreateLink(fromNode, fromSocket, toNode, toSocket);
		}
	}

	edited = false;
	CentreView();
}

// Global cursor overriding. See utils.js.
function UpdateCursor() {
	if (grabbedElement) {
		if (grabbedElement == canvas) {
			SetGlobalCursor("grabbing");
		} else if (grabbedElement.classList.contains("node")) {
			SetGlobalCursor("move");
		} else if (grabbedElement.classList.contains("socket-pin")) {
			SetGlobalCursor("crosshair");
		} else {
			// Fallback -- this shouldn't happen.
			SetGlobalCursor();
		}
	} else {
		SetGlobalCursor();
	}
}

// Global keypress events, for deleting selected nodes and multi-selection.
document.addEventListener("keydown", function(event) {
	shiftHeld = event.shiftKey;

	if (event.code == "Delete") {
		var numberSelected = document.getElementsByClassName("selected").length;
		if (numberSelected > 1) {
			prompt = new ModalPrompt(`Are you sure you want to delete ${numberSelected} nodes?`, "Delete multiple nodes?", DeleteSelected);
			prompt.yesButton.classList.add("danger");
		} else {
			DeleteSelected();
		}
	}
});
document.addEventListener("keyup", function(event) { shiftHeld = event.shiftKey; });

// Canvas grab/release events, for panning.
canvas.onmousedown = function(event) {
	if (event.button != 0) { return; }

	if (!shiftHeld) {
		// Clear selections and start panning the canvas.
		ClearClass("selected");
		var canvasPosition = canvas.getBoundingClientRect();
		grabbedPosition = PositionToVector2(canvas);
		grabbedElement = canvas;
		UpdateCursor();
	} else {
		// If the user is holding shift, start box multi-selection instead.
		// TODO
	}
};

// Mouse release event, drop any node currently being dragged.
onmouseup = function() {
	// Only move the grabbed element if it's a node dummy.
	if (grabDummy && grabDummy.classList.contains("dummy")) {
		grabbedElement.style.left = grabDummy.style.left;
		grabbedElement.style.top = grabDummy.style.top;
		
		// Re-draw connected link lines.
		var sockets = NodeDataFromElement(grabbedElement).sockets;
		for (const socketName in sockets) { // Iterate over each socket using its name.
			if (sockets[socketName].wires) { // If no wires field exists yet, abort.
				for (var linkIndex = 0; linkIndex < sockets[socketName].wires.length; linkIndex++) {
					var linkEnds = GetLinkEnds(grabbedElement.getAttribute("node-id"), socketName, linkIndex);
					var firstPosition = CentreToVector2(linkEnds.startSocket.element);
					var secondPosition = CentreToVector2(linkEnds.endSocket.element);
					DrawLine(firstPosition, secondPosition, sockets[socketName].wires[linkIndex].element);
				}
			}
		}
	}
	grabDummy = null;

	// To prevent stray dummies, should previous mouseup events somehow fail.
	var dummies = Array.from(document.getElementsByClassName("dummy"));
	for (var i = 0; i < dummies.length; i++) {
		dummies[i].remove();
	}
	var dummyLinks = Array.from(document.getElementsByClassName("link-dummy"));
	for (var i = 0; i < dummyLinks.length; i++) {
		dummyLinks[i].remove();
	}

	if (grabbedElement) {
		grabbedElement.classList.remove("grabbed");
		if (grabbedElement.classList.contains("node") && !nodeRoot.contains(grabbedElement)) { nodeRoot.appendChild(grabbedElement); }
		grabbedElement = null;
		grabbedPosition.clear();
	}

	grabbedSocket = null;
	ClearClass("linking");
	ClearClass("invalid-link");
	UpdateCursor();
};

// Global mouse movement function. Handle all dragging operations (node drag/drop, canvas panning) here.
onmousemove = function(event) {
	window.scroll(0, 0);
	tooltip.style.left = `${event.clientX}px`;
	tooltip.style.top = `${event.clientY}px`;

	//var zoom = GetZoom();
	grabbedPosition.add(event.movementX, event.movementY);

	if (grabbedElement == canvas) {
		grabbedElement.style.left = grabbedPosition.x + "px";
		grabbedElement.style.top = grabbedPosition.y + "px";

		bg.style.left = -(Math.floor(grabbedPosition.x / GRID_SIZE) * GRID_SIZE) - GRID_SIZE + "px";
		bg.style.top = -(Math.floor(grabbedPosition.y / GRID_SIZE) * GRID_SIZE) - GRID_SIZE + "px";
	} else if (grabbedElement && grabDummy) {
		if (grabDummy.classList.contains("dummy")) {
			// If it's a node dummy, move it to the nearest grid position.
			var canvasPosition = canvas.getBoundingClientRect();
			grabDummy.style.left = Math.floor((grabbedPosition.x - canvasPosition.x) / GRID_SIZE) * GRID_SIZE + "px";
			grabDummy.style.top = Math.floor((grabbedPosition.y - canvasPosition.y) / GRID_SIZE) * GRID_SIZE + "px";
		} else if (grabDummy.classList.contains("link-dummy")) {
			// It's a link line dummy, move it freely.
			var currentTargets = document.querySelectorAll(":hover");
			for (var i = 0; i < currentTargets.length; i++) {
				// Abort if we're hovering over another socket, snap to that instead.
				if (currentTargets[i] != grabbedElement.parentElement && currentTargets[i].classList.contains("socket")) { return; }
			}

			// Draw a line from the first socket to the cursor position, or update the line if it already exists.
			var firstSocket = SocketFromElement(grabbedSocket.nodeElement, grabbedSocket.socketName);
			var startPosition = CentreToVector2(firstSocket.element);
			var endPosition = new Vector2(event.clientX, event.clientY);
			var linkLine = DrawLine(startPosition, endPosition, grabDummy && grabDummy.classList.contains("link-dummy") ? grabDummy : null);
			grabDummy = linkLine;
			linkLine.classList.add("link-dummy");
		}
	}
};

// Global scroll wheel function, for canvas zooming.
// This currently breaks everything from canvas panning, to drag and drop, to link lines.
// onwheel = function(event) {
// 	var oldZoom = GetZoom();
// 	var input = -Math.max(Math.min(event.deltaY, ZOOM_STEP), -ZOOM_STEP);
// 	var zoom = Math.max(Math.min(oldZoom + input, MAX_ZOOM), MIN_ZOOM);
// 	nodeRoot.style.scale = zoom;

// 	var canvasPosition = canvas.getBoundingClientRect();
// 	canvas.style.left = (canvasPosition.x * (zoom / oldZoom)) + "px";
// 	canvas.style.top = (canvasPosition.y * (zoom / oldZoom)) + "px";
// }
