chrome.runtime.onInstalled.addListener(() => {

  chrome.contextMenus.removeAll(() => {

    chrome.contextMenus.create({
      id: "generateTestCases",
      title: "Generate QA Test Cases",
      contexts: ["selection"]
    });

  });

});

// chrome.contextMenus.create({
//   id: "generateTestCases",
//   title: "Generate QA Test Cases",
//   contexts: ["selection"]
// });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === "generateAI") {

    console.log("Received AI request:", request.text);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    fetch("http://localhost:3000/generate-tests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requirement: request.text
      }),
      signal: controller.signal
    })
    .then(res => {
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res.text();
    })
    .then(text => {
      console.log("AI response text:", text);
      // Try to parse as JSON, if fails, use as is
      try {
        const data = JSON.parse(text);
        sendResponse({ output: data.output || text });
      } catch {
        sendResponse({ output: text });
      }
    })
    .catch(err => {
      clearTimeout(timeoutId);
      console.error("AI fetch failed:", err);
      sendResponse({ output: "AI request failed: " + err.message });
    });

    return true;
  }

});


chrome.contextMenus.onClicked.addListener((info, tab) => {

  if (info.menuItemId === "generateTestCases") {

    chrome.tabs.sendMessage(tab.id, {
      action: "generate",
      text: info.selectionText
    });

  }

});
