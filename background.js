chrome.runtime.onInstalled.addListener(() => {

  chrome.contextMenus.removeAll(() => {

    chrome.contextMenus.create({
      id: "generateTestCases",
      title: "Generate QA Test Cases",
      contexts: ["selection"]
    });

  });

});

function countTestCasesFromOutput(output) {
  if (!output) return 0;

  const explicitCountPatterns = [
    /\b(\d+)\s+test\s*cases?\b/i,
    /\b(?:generated|created|returned|produced)\s+(\d+)\s+cases?\b/i,
    /\b(?:total|count)\s*[:=]\s*(\d+)\b/i,
  ];

  for (const pattern of explicitCountPatterns) {
    const match = output.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  const candidates = [
    (output.match(/^\s*(?:[#>*-]\s*)*test\s*case\s*[:#-]?\s*\d+/gim) || []).length,
    (output.match(/^\s*(?:[#>*-]\s*)*case\s*[:#-]?\s*\d+/gim) || []).length,
    (output.match(/^\s*(?:[#>*-]\s*)*tc[\s:#-]*\d+/gim) || []).length,
    (output.match(/^\s*title\s*:/gim) || []).length,
    (output.match(/^\s*\d+[.)-]\s*(test\s*case|scenario|use\s*case)\b/gim) || []).length,
  ];

  return Math.max(...candidates, 0);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === "generateAI") {

    console.log("Received AI request:", request.text);
    const generationOptions = request.options || {};

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    fetch("http://localhost:3000/generate-tests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requirement: request.text,
        options: generationOptions,
        deterministic: generationOptions.deterministic === true,
        desiredCount: generationOptions.desiredCount,
        outputFormat: generationOptions.outputFormat || "structured-text-v1",
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

      let output = text;
      let parsedCount = 0;
      try {
        const data = JSON.parse(text);
        output = data.output || text;
        const dataCount = Number(data.count);
        if (Number.isFinite(dataCount) && dataCount > 0) {
          parsedCount = dataCount;
        }
      } catch {
        output = text;
      }

      const inferredCount = countTestCasesFromOutput(output);
      const caseCount = Math.max(parsedCount, inferredCount);
      console.log(`[QA Extension][Background] AI generated ${caseCount} test case(s).`);
      sendResponse({ output, count: caseCount, ok: true });
    })
    .catch(err => {
      clearTimeout(timeoutId);
      console.error("AI fetch failed:", err);
      sendResponse({
        output: "AI request failed: " + err.message,
        count: 0,
        ok: false,
        error: err.message,
      });
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