chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "generateTestCase",
    title: "Generate QA Test Cases",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {

  if (info.menuItemId === "generateTestCase") {

    chrome.tabs.sendMessage(tab.id, {
      action: "generate",
      text: info.selectionText
    });

  }

});
