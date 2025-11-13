async function getWiFiDetails() {
	var wifiRequest = await fetch("/wifi_details");
	var wifiJson = await wifiRequest.json();

	document.getElementById("apssid").textContent = wifiJson.AP.SSID;
	document.getElementById("apip").textContent = wifiJson.AP.IP;
	document.getElementById("clientssid").textContent = wifiJson.Client.SSID;
	document.getElementById("clientip").textContent = wifiJson.Client.IP;
}

// Initial get on page load
getWiFiDetails();

// Update the details every 30 seconds
setInterval(getWiFiDetails, 30000);
