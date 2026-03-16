console.log("QA Extension content script loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generate") {
    const selectedText = request.text;

    createFloatingPanel(selectedText);
  }
});

function generateNegativeTests(action) {
  return [
    {
      title: `Verify empty input for ${action}`,
      steps: `1. Attempt action without providing required input for: ${action}`,
      expected: "System should show required field validation",
    },

    {
      title: `Verify special characters handling for ${action}`,
      steps: `1. Perform action using special characters (!@#$%^&)`,
      expected: "System should sanitize or reject invalid characters",
    },

    {
      title: `Verify max length validation for ${action}`,
      steps: `1. Perform ${action} using extremely long input`,
      expected: "System should enforce max length restriction",
    },

    {
      title: `Verify unauthorized access for ${action}`,
      steps: `1. Attempt ${action} without proper authentication`,
      expected: "System should block the action",
    },
  ];
}

//This breaks a paragraph into individual requirements.
function extractActions(text) {
  const sentences = text
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);


  return sentences;
}

// This function creates a floating panel on the webpage to display generated test cases based on the selected text
async function createFloatingPanel(text) {
  const oldPanel = document.getElementById("qaTestPanel");
  if (oldPanel) oldPanel.remove();

  const actions = extractActions(text);

  if (actions.length === 0) {
    actions.push(text);
  }

  const testCases = [];

  // actions.forEach(action => {

  //   testCases.push({
  //     title: `Verify successful scenario for ${action}`,
  //     steps: `1. Open application\n2. Perform action: ${action}`,
  //     expected: "System completes action successfully"
  //   });

  //   testCases.push({
  //     title: `Verify invalid scenario for ${action}`,
  //     steps: `1. Attempt invalid version of: ${action}`,
  //     expected: "System shows validation error"
  //   });

  //   testCases.push({
  //     title: `Verify edge case for ${action}`,
  //     steps: `1. Perform boundary condition of: ${action}`,
  //     expected: "System handles edge case correctly"
  //   });

  //   const negativeTests = generateNegativeTests(action);

  //   negativeTests.forEach(test => testCases.push(test));

  // });

  const panel = document.createElement("div");
  panel.id = "qaTestPanel";

  panel.style.position = "fixed";
  panel.style.bottom = "20px";
  panel.style.right = "20px";
  panel.style.width = "420px";
  panel.style.maxHeight = "400px";
  panel.style.overflowY = "auto";
  panel.style.background = "white";
  panel.style.border = "1px solid #ccc";
  panel.style.borderRadius = "8px";
  panel.style.padding = "10px";
  panel.style.zIndex = "999999";
  panel.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
  panel.style.fontFamily = "Arial";

  // Header
  const header = document.createElement("div");
  header.style.cursor = "move";
  header.style.fontWeight = "bold";
  header.style.marginBottom = "8px";
  header.textContent = `QA Test Case Generator (${testCases.length} cases)`;

  panel.appendChild(header);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✖";
  closeBtn.style.float = "right";
  closeBtn.onclick = () => panel.remove();

  header.appendChild(closeBtn);

  let output = "";

  testCases.forEach((tc, i) => {
    output += `Test Case ${i + 1}\n`;
    output += `Title: ${tc.title}\n`;
    output += `Steps:\n${tc.steps}\n`;
    output += `Expected: ${tc.expected}\n\n`;
  });

  const pre = document.createElement("pre");
pre.textContent = "Generating AI test cases...";


chrome.runtime.sendMessage(
  {
    action: "generateAI",
    text: text
  },
  (response) => {

    if (chrome.runtime.lastError) {
      pre.textContent = "Extension connection error.";
      console.error(chrome.runtime.lastError);
      return;
    }

    if (!response || !response.output) {
      pre.textContent = "AI returned no test cases.";
      return;
    }

    pre.textContent = response.output;

  }
);

  pre.style.whiteSpace = "pre-wrap";
  pre.style.fontSize = "13px";

  panel.appendChild(pre);

  // Copy button
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.style.marginRight = "10px";

  copyBtn.onclick = () => {
  navigator.clipboard.writeText(pre.textContent);
};


  panel.appendChild(copyBtn);

  // CSV export button
  const csvBtn = document.createElement("button");
  csvBtn.textContent = "Export CSV";

  csvBtn.onclick = () => {
    let csv = "Title,Steps,Expected Result\n";

    testCases.forEach((tc) => {
      const safeTitle = tc.title.replace(/"/g, '""');
      const safeSteps = tc.steps.replace(/\n/g, " ").replace(/"/g, '""');
      const safeExpected = tc.expected.replace(/"/g, '""');

      csv += `"${safeTitle}","${safeSteps}","${safeExpected}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "testcases.csv";
    a.click();
  };

  panel.appendChild(csvBtn);

  document.body.appendChild(panel);
  makeDraggable(panel, header);
}

//he panel can be dragged anywhere on the screen
function makeDraggable(panel, header) {
  let offsetX = 0;
  let offsetY = 0;
  let isDragging = false;

  header.onmousedown = (e) => {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
  };

  document.onmousemove = (e) => {
    if (!isDragging) return;

    panel.style.left = e.clientX - offsetX + "px";
    panel.style.top = e.clientY - offsetY + "px";
    panel.style.bottom = "auto";
    panel.style.right = "auto";
  };

  document.onmouseup = () => {
    isDragging = false;
  };
}

// const aiOutput = await generateAITestCases(text);
// pre.textContent = aiOutput;
