var iconRoot = "images/icons/";

var categoryList = document.getElementById("categories");
var modal = document.getElementById("modal");
var navPane = document.getElementById("nav-pane");
var navToggle = document.getElementById("nav-show-hide");

var centreButton = document.getElementById("centre-view");
var configButton = document.getElementById("config");
var loadButton = document.getElementById("load");
var newButton = document.getElementById("new");
var saveButton = document.getElementById("save");

var edited = false;
var showModal = false;
var showNav = false;

// To be called on initial load, and if the new file button is clicked.
// TODO: Remember to prompt the user if they have unsaved work.
async function Init() {
	// The Chromium renderer got it into its head that it should render the canvas offset up and left by random amounts,
	// so we're "politely correcting" it once again (see: snapping its neck).
	window.scroll(0, 0);

	var categoriesRequest = await fetch("data/categories.json");
	CATEGORIES = await categoriesRequest.json();
	var nodeTypesRequest = await fetch("data/nodes.json");
	NODE_TYPES = await nodeTypesRequest.json();

	// Clear the category list and canvas.
	while (categoryList.children.length > 0) { categoryList.removeChild(categoryList.lastChild); }
	while (nodes.length > 0) { DeleteNode(nodeRoot.lastChild); }

	var containerLookup = new Object();
	
	// Iterating over objects doesn't return the actual entries themselves, because that would be reasonable.
	// It returns the index string instead, so we have to politely correct (see: bludgeon) the browser with another variable.
	for (const index in CATEGORIES) {
		var data = CATEGORIES[index];

		var container = document.createElement("div");
		container.classList.add("category");
		container.style.backgroundColor = `${data["colour"]}40`; // Append 75% alpha (25% opacity) to the colour code.
		containerLookup[index] = container;

		var categoryLabel = document.createElement("h1");
		categoryLabel.style.backgroundColor = data["colour"];
		categoryLabel.style.color = data["text-colour"];
		categoryLabel.innerText = index;
		categoryLabel.id = index;
		container.appendChild(categoryLabel);

		categoryList.appendChild(container);
	}

	// Next, populate the categories with the node types.
	for (const index in NODE_TYPES) {
		var data = NODE_TYPES[index];
		if (data.hidden) { continue; }

		if (containerLookup[data.category]) {
			var listNode = document.createElement("div");
			listNode.classList.add("list-node");
			listNode.style.backgroundColor = `${CATEGORIES[data.category].colour}80`; // Append 50% alpha to the colour code.
			listNode.id = index;

			var nodeLabel = document.createElement("h2");
			nodeLabel.style.color = CATEGORIES[data.category]["text-colour"];
			nodeLabel.innerText = index;
			listNode.appendChild(nodeLabel);

			var nodeAdd = document.createElement("button");
			nodeAdd.classList.add("add-node", "friendly", "global-button");
			listNode.appendChild(nodeAdd);
			var addSymbol = document.createElement("img");
			addSymbol.src = "images/icons/plus.svg";
			addSymbol.setAttribute("draggable", false);
			nodeAdd.appendChild(addSymbol);

			// Add the node to the appropriate category.
			var category = containerLookup[data.category];
			category.appendChild(listNode);

			// Finally, hook click/drag mouse events for adding a new node.
			nodeAdd.onmousedown = function(event) {
				if (event.button != 0) { return; }
				var newNode = CreateNode(index, true);
				grabbedElement = newNode;
				CreateDummy(newNode);

				grabbedPosition.add(event.clientX - (GRID_SIZE / 2), event.clientY - (GRID_SIZE / 2));

				var canvasPosition = canvas.getBoundingClientRect();
				grabDummy.style.left = Math.floor((grabbedPosition.x - canvasPosition.x) / GRID_SIZE) * GRID_SIZE + "px";
				grabDummy.style.top = Math.floor((grabbedPosition.y - canvasPosition.y) / GRID_SIZE) * GRID_SIZE + "px";
				
				UpdateCursor();
			}
		} else { // TODO: Add a default/misc category?
			console.warn(`Category '${data.category}' does not exist! Skipping '${index}'.`);
		}
	}

	edited = false;
}

// Nav pane toggling for narrow screens.
function UpdateMenuState() {
	if (showNav && window.innerWidth >= 1000) {
		showNav = false;
		navPane.style.marginLeft = 0;
	}
	
	navPane.style.marginLeft = showNav ? "205px" : 0;
	navToggle.getElementsByTagName("img")[0].src = showNav ? iconRoot + "left.svg" : iconRoot + "menu.svg";
}
UpdateMenuState();
onresize = function() { UpdateMenuState(); }
navToggle.onclick = function() {
	showNav = !showNav;
	UpdateMenuState();
}

// Modal toggling.
function UpdateModalState() {
	if (showModal) {
		modal.classList.add("visible");
	} else {
		modal.classList.remove("visible");
	}
}

// Reset canvas and refresh the nodes list on 'New' button click.
newButton.onclick = function() {
	if (edited) { // Give a warning prompt if the user has unsaved work.
		prompt = new ModalPrompt("There are unsaved changes. Would you like to discard them and continue?", "Create New?", Init);
		prompt.yesButton.classList.add("danger");
	} else { // No unsaved work here, just do it.
		Init();
	}
}

// Load the current ESP config on 'Load' button click.
// TODO: Prompt user about unsaved work, same as 'New'.
loadButton.onclick = function() {
	if (edited) { // Give a warning prompt if the user has unsaved work.
		prompt = new ModalPrompt("There are unsaved changes. Would you like to discard them and continue?", "Load Config?", Deserialise);
		prompt.yesButton.classList.add("danger");
	} else { // No unsaved work here, just do it.
		Deserialise();
	}
}

// Centres the view on any loaded nodes.
function CentreView() {
	var minExtents;
	var maxExtents;

	for (var i = 0; i < nodes.length; i++) {
		var element = nodes[i].element;
		if (!element) { continue; }

		if (!(minExtents && maxExtents)) {
			minExtents = new Vector2(element.offsetLeft, element.offsetTop);
			maxExtents = new Vector2(element.offsetLeft + element.offsetWidth, element.offsetTop + element.offsetHeight);
		} else {
			minExtents.set(Math.min(minExtents.x, element.offsetLeft), Math.min(minExtents.y, element.offsetTop));
			maxExtents.set(Math.max(maxExtents.x, element.offsetLeft + element.offsetWidth), Math.max(maxExtents.y, element.offsetTop + element.offsetHeight));
		}
	}

	var extentsCentre = new Vector2((maxExtents.x - minExtents.x) / 2, (maxExtents.y - minExtents.y) / 2);
	extentsCentre.add(minExtents.x, minExtents.y);
	extentsCentre.add(-window.innerWidth / 2, -window.innerHeight / 2);

	canvas.style.left = `${-extentsCentre.x}px`;
	canvas.style.top = `${-extentsCentre.y}px`;

	bg.style.left = (Math.floor((extentsCentre.x) / GRID_SIZE) * GRID_SIZE) - GRID_SIZE + "px";
	bg.style.top = (Math.floor((extentsCentre.y) / GRID_SIZE) * GRID_SIZE) - GRID_SIZE + "px";
}

centreButton.onclick = CentreView;

// Saves the Wi-Fi config specified by the user.
async function SaveWiFiConfig() {
	var SSID = document.getElementById("ssid").value;
	var Password = document.getElementById("password").value;

	if (ssid && password) {
		const requestBody = JSON.stringify({SSID, Password});
		var request = await fetch("/wifi", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: requestBody
		});

		var response = await request.text();
		console.log(response);
	}
}

async function Scan() {
	var resultsPane = document.getElementById("scan-results");
	var ssid = document.getElementById("ssid");
	var password = document.getElementById("password");

	if (!(resultsPane && ssid && password)) { return; }

	// First, delete all old results.
	for (var i = resultsPane.childNodes.length - 1; i >= 0; i--) {
		var element = resultsPane.childNodes[i];
		if (element.tagName.toLowerCase() == "button" && !element.classList.contains("corner-button")) {
			element.remove();
		}
	}

	// Scan for currently available access points and populate the list.
	var request = await fetch("/wifi");
	var wifiData = await request.json();

	for (let i = 0; i < wifiData.length; i++) {
		var connectButton = document.createElement("button");
		connectButton.classList.add("tile-button");
		connectButton.type = "button";
		var secureState = wifiData[i].SECURE == "Secure" ? "(Secure)" : "(Insecure)";
		connectButton.innerText = `${wifiData[i].SSID} ${secureState}`;

		var rssi = document.createElement("span");
		rssi.classList.add("misc-info");
		rssi.innerText = wifiData[i].RSSI ? `RSSI: ${wifiData[i].RSSI}` : "No RSSI";
		connectButton.appendChild(rssi);

		resultsPane.appendChild(connectButton);

		connectButton.onclick = function() {
			ssid.value = wifiData[i].SSID;
			password.value = "";
		}
	}
}

configButton.onclick = function() {
	// Create the prompt modal first, and edit appropriately.
	prompt = new ModalPrompt("", "ESP32 Configuration", SaveWiFiConfig);
	prompt.headerImage.src = "images/icons/settings.svg";
	prompt.yesButton.childNodes[0].nodeValue = "SAVE"; // Kudos to Paul D. Waite: https://stackoverflow.com/a/4106910
	prompt.yesImage.src = "images/icons/save.svg";
	prompt.noButton.classList.add("danger");

	// Add a form to the empty prompt area.
	var form = document.createElement("form");
	
	var clientSection = document.createElement("div");
	clientSection.classList.add("config-section");
	var clientHeader = document.createElement("h2");
	clientHeader.innerText = "SSID / Password";
	clientSection.appendChild(clientHeader);

	// Add the SSID/Password fields to the client pane.
	var ssid = document.createElement("input");
	ssid.type = "text";
	ssid.setAttribute("maxLength", 32);
	ssid.placeholder = "SSID";
	ssid.id = "ssid";
	clientSection.appendChild(ssid);
	var password = document.createElement("input");
	password.type = "password";
	password.setAttribute("maxLength", 64);
	password.placeholder = "Password"
	password.id = "password";
	clientSection.appendChild(password);

	// Create the scanning pane, with corner button for manual refresh.
	var scanSection = document.createElement("div");
	scanSection.classList.add("config-section");
	scanSection.id = "scan-results";
	var scanHeader = document.createElement("h2");
	scanHeader.innerText = "Access Points";
	scanSection.appendChild(scanHeader);

	var scanButton = document.createElement("button");
	scanButton.type = "button";
	scanButton.classList.add("corner-button");
	scanButton.innerText = "SCAN";
	var scanIcon = document.createElement("img");
	scanIcon.src = "images/icons/refresh.svg";
	scanButton.appendChild(scanIcon);
	scanSection.appendChild(scanButton);

	form.appendChild(clientSection);
	form.appendChild(scanSection);

	prompt.promptArea.appendChild(form);

	// Hook the scan button event and perform a courtesy scan.
	scanButton.onclick = Scan;
	Scan();
}