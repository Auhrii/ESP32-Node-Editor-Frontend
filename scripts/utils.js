// This script file contains constants, utility functions, and custom data types, and should be loaded before all other scripts.

var CATEGORIES; // These should really be constants, but they're refreshed on each Init() call.
var NODE_TYPES;
const GRID_SIZE = 40; // TODO: Edit CSS to use --grid-size variable, set it to this.
const MAX_ZOOM = 1;
const MIN_ZOOM = 0.5;
const ZOOM_STEP = 0.1;
const LINE_STROKE = 2;
const MAX_RANGEMAP_FIELDS = 4;

const SVGNS = "http://www.w3.org/2000/svg";

Vector2 = function(x, y) {
	this.x = x ? x : 0;
	this.y = y ? y : 0;
	this.clear = function() { this.x = 0; this.y = 0; },
	this.set = function(newX, newY) { this.x = newX; this.y = newY; },
	this.add = function(addX, addY) { this.x += addX; this.y += addY; }
}

NodeSocket = function(node, socketID) {
	this.nodeElement = node;
	this.nodeID = node.getAttribute("node-id");
	this.socketName = socketID;
}

NodeLink = function(startNodeID, startSocketName, endNodeID, endSocketName) {
	// Make sure the startNode is actually the starting node, else invert the results.
	var isStart = nodes[startNodeID].sockets[startSocketName].direction == "out";

	this.startSocketName = isStart ? startSocketName : endSocketName;
	this.endSocketName = isStart ? endSocketName : startSocketName;

	this.startNode = isStart ? nodes[startNodeID] : nodes[endNodeID];
	this.endNode = isStart ? nodes[endNodeID] : nodes[startNodeID];
	this.startSocket = isStart ? this.startNode.sockets[startSocketName] : this.startNode.sockets[endSocketName];
	this.endSocket = isStart ? this.endNode.sockets[endSocketName] : this.endNode.sockets[startSocketName];
}

ModalPrompt = function(promptText, headerText, yesFunction) {
	var container = modal.getElementsByClassName("centre-box")[0];
	// First, clear any existing prompt.
	while (container.childNodes.length > 0) {
		container.firstChild.remove();
	}

	if (headerText) {
		var header = document.createElement("h1");
		header.innerText = headerText.toUpperCase();
		container.appendChild(header);
		var headerImage = document.createElement("img");
		headerImage.classList.add("header-image");
		headerImage.src = "images/icons/alert.svg";
		container.appendChild(headerImage);

		this.headerImage = headerImage;
	}

	// Generate modal text and buttons.
	var prompt = document.createElement("p");
	prompt.innerText = promptText;
	container.appendChild(prompt);

	var yesButton = document.createElement("button");
	yesButton.innerText = "YES";
	var yesImage = document.createElement("img");
	yesImage.src = "images/icons/check.svg";
	yesButton.appendChild(yesImage);
	container.appendChild(yesButton);

	var noButton = document.createElement("button");
	noButton.innerText = "CANCEL";
	var noImage = document.createElement("img");
	noImage.src = "images/icons/x.svg";
	noButton.appendChild(noImage);
	container.appendChild(noButton);

	// Make the buttons accessible, so the calling function can modify them.
	this.promptArea = prompt;
	this.yesButton = yesButton;
	this.yesImage = yesImage;
	this.noButton = noButton;
	this.noImage = noImage;

	// Button default actions.
	yesButton.onclick = function() {
		showModal = false;
		UpdateModalState();
		if (yesFunction && typeof(yesFunction) === "function") {
			yesFunction(prompt); // Pass the prompt text/form area to the function for form processing, etc.
		}
	}

	noButton.onclick = function() {
		showModal = false;
		UpdateModalState();
	}

	// Display the modal.
	showModal = true;
	UpdateModalState();
}

// Used to save config.json using HTTP Post
async function saveConfig(serialised) {
	const response = await fetch("config.json", {
		method: "POST",
		headers: {
			"Content-Type": "text/plain",
			"Content-Length": serialised.length
		},
		body: serialised
	});
	const serverResponse = await response.text();
	console.log(serverResponse);
}

// Removes the given class from any elements that have it. `except` is optional, and specifies an element to exclude.
// getElementsByClassName returns a NodeList, which updates its length as we unassign elements.
// Converted to an array to 'freeze' it and fix this.
function ClearClass(className, except) {
	var elements = Array.from(document.getElementsByClassName(className));
	for (var i = 0; i < elements.length; i++) {
		if (elements[i] != except) { elements[i].classList.remove(className); }
	}
}

// Kudos to Felix Engelmann for the cursor override: https://stackoverflow.com/a/67585046
// Modifications made for arbitrary cursor setting, override deduplication, and removal.
function SetGlobalCursor(cursorType) {
	var oldOverride = document.getElementById("cursor-override");
	if (oldOverride) { oldOverride.remove(); }

	if (cursorType) {
		const cursorStyle = document.createElement("style");
		cursorStyle.innerHTML = `* { cursor: ${cursorType} !important; }`;
		cursorStyle.id = "cursor-override";
		document.head.appendChild(cursorStyle);
	}
}

// Creates a new node field, ready to be populated with I/O sockets or config inputs.
function CreateField(fieldName) {
	var fieldContainer = document.createElement("div");
	fieldContainer.classList.add("field");
	var fieldLabel = document.createElement("h2");
	fieldLabel.innerText = fieldName;
	fieldContainer.appendChild(fieldLabel);

	return fieldContainer;
}

// Get the socket data from a node HTML element.
function SocketFromElement(node, socketName) {
	var id = node.getAttribute("node-id");
	return nodes[id].sockets[socketName];
}
// Get the object from the nodes array from a node HTML element.
function NodeDataFromElement(node) {
	return nodes[node.getAttribute("node-id")];
}

// Get the current zoom level of the canvas.
function GetZoom() { return parseFloat(nodeRoot.style.scale ? nodeRoot.style.scale : 1); }

// Draws a line between two points, or edits the line if it already exists.
// `start` and `end` are the positions - only the distance between them matters, as the
//		resulting SVG will be parented (and anchored to) a socket pin.
// `imageCanvas` should be passed to edit it, else the function will create a new SVG.
function DrawLine(start, end, imageCanvas) {
	if (!imageCanvas) { // Kudos to loganfsmyth: https://stackoverflow.com/a/28734954
		imageCanvas = document.createElementNS(SVGNS, "svg");
	}

	// Calculate the difference between the start and end positions to get the SVG size and offsets.
	var sizeRaw = new Vector2(end.x - start.x, end.y - start.y);
	var bounds = new Vector2(Math.max(Math.abs(sizeRaw.x), LINE_STROKE), Math.max(Math.abs(sizeRaw.y), LINE_STROKE));
	imageCanvas.style.width = `${bounds.x + LINE_STROKE}px`;
	imageCanvas.style.height = `${bounds.y + LINE_STROKE}px`;
	imageCanvas.setAttribute("viewBox", `0 0 ${bounds.x} ${bounds.y}`);
	var translateX = sizeRaw.x < 0 ? `calc(-100% + ${LINE_STROKE / 2}px)` : `-${LINE_STROKE / 2}px`;
	var translateY = sizeRaw.y < 0 ? `calc(-100% + ${LINE_STROKE / 2}px)` : `-${LINE_STROKE / 2}px`;
	// Using translate here because the CSS already uses top and left to centre the anchor point.
	imageCanvas.style.transform = `translate(${translateX},${translateY})`;

	// Clean up any old lines before drawing any new ones.
	var oldLines = Array.from(imageCanvas.getElementsByTagName("line"));
	for (var i = 0; i < oldLines.length; i++) { oldLines[i].remove(); }

	// Kudos to Paul LeBeau, too: https://stackoverflow.com/a/28734771
	var line = document.createElementNS(SVGNS, "line");
	
	line.setAttribute("x1", sizeRaw.x < 0 ? bounds.x : (LINE_STROKE / 2));
	line.setAttribute("y1", sizeRaw.y < 0 ? bounds.y : (LINE_STROKE / 2));
	line.setAttribute("x2", Math.max(sizeRaw.x, (LINE_STROKE / 2)));
	line.setAttribute("y2", Math.max(sizeRaw.y, (LINE_STROKE / 2)));
	imageCanvas.appendChild(line);

	// Finally, set the position on the canvas, append it, and return it.
	// Also offset by the canvas position.
	var canvasPosition = canvas.getBoundingClientRect();
	imageCanvas.style.left = `${start.x - canvasPosition.left}px`;
	imageCanvas.style.top = `${start.y - canvasPosition.top}px`;

	canvas.appendChild(imageCanvas);
	return imageCanvas;
}

// Vector2 conversion functions.
// Returns the top left-anchored position of a HTML element as a Vector2 object.
function PositionToVector2(target) {
	var boundingRect = target.getBoundingClientRect();
	return new Vector2(boundingRect.x, boundingRect.y);
}
// Returns the size of a HTML element as a Vector2 object.
function SizeToVector2(target) {
	var boundingRect = target.getBoundingClientRect();
	return new Vector2(boundingRect.width, boundingRect.height);
}
// Returns the centre point of a HTML element as a Vector2 object.
function CentreToVector2(target) {
	var boundingRect = target.getBoundingClientRect();
	var vecOut = new Vector2(boundingRect.x, boundingRect.y);
	vecOut.add(boundingRect.width / 2, boundingRect.height / 2);
	return vecOut;
}

// Returns both ends of a node link as a NodeLink object.
function GetLinkEnds(nodeID, socketName, linkID) {
	var endNodeID = nodes[nodeID].sockets[socketName].wires[linkID].to;
	var endSocketName = nodes[nodeID].sockets[socketName].wires[linkID].socket;

	return new NodeLink(nodeID, socketName, endNodeID, endSocketName);
}