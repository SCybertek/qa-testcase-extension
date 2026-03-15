let generatedCases = [];

document.getElementById("generateBtn").addEventListener("click", () => {
  const text = document.getElementById("inputText").value;

  if (!text) return;

  generatedCases = [
    {
      title: "Verify successful scenario",
      steps: `1. Open application\n2. Perform action: ${text}`,
      expected: "System completes action successfully",
    },
    {
      title: "Verify invalid input handling",
      steps: `1. Open application\n2. Attempt invalid version of: ${text}`,
      expected: "System shows validation error",
    },
    {
      title: "Verify edge case",
      steps: `1. Perform boundary condition of: ${text}`,
      expected: "System handles edge case correctly",
    },
  ];

  let output = "";

  generatedCases.forEach((tc, index) => {
    output += `Test Case ${index + 1}\n`;
    output += `Title: ${tc.title}\n`;
    output += `Steps:\n${tc.steps}\n`;
    output += `Expected Result: ${tc.expected}\n\n`;
  });

  document.getElementById("output").textContent = output;

  document.getElementById("copyBtn").addEventListener("click", () => {
    const text = document.getElementById("output").textContent;

    navigator.clipboard.writeText(text);
  });

  document.getElementById("csvBtn").addEventListener("click", () => {
    if (!generatedCases.length) return;

    let csv = "Title,Steps,Expected Result\n";

    generatedCases.forEach((tc) => {
      csv += `"${tc.title}","${tc.steps.replace(/\n/g, " ")}","${tc.expected}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "testcases.csv";
    a.click();
  });

  document.getElementById("clearBtn").addEventListener("click", () => {

  document.getElementById("inputText").value = "";
  document.getElementById("output").textContent = "";

});

});
