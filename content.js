console.log("QA Extension content script loaded");

// Listen for generate requests from the context menu flow.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generate") {
    createFloatingPanel(request.text);
  }
});

// Break selected requirement text into short actionable lines.
function extractActions(text) {
  const sentences = text
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  return sentences;
}

// Infer how many test cases are present in AI/plain-text output.
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

// Escape cell values safely for CSV downloads.
function toCsvSafeValue(value) {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

// Cache settings for offline fallback reuse.
const AI_CACHE_STORAGE_KEY = "qaAiCaseCache";
const AI_CACHE_LIMIT = 25;

// Normalize similar prompts to one cache key.
function buildCacheKey(input) {
  return String(input || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Read cached AI output for the current normalized prompt.
function getCachedAiOutput(cacheKey) {
  return new Promise((resolve) => {
    if (!cacheKey || !chrome.storage?.local) {
      resolve(null);
      return;
    }

    chrome.storage.local.get([AI_CACHE_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.warn("[QA Extension] Failed to read AI cache:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }

      const cache = result?.[AI_CACHE_STORAGE_KEY] || {};
      resolve(cache[cacheKey] || null);
    });
  });
}

// Save latest successful AI output and keep only recent entries.
function saveCachedAiOutput(cacheKey, output, count) {
  return new Promise((resolve) => {
    if (!cacheKey || !output || !chrome.storage?.local) {
      resolve(false);
      return;
    }

    chrome.storage.local.get([AI_CACHE_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.warn("[QA Extension] Failed to read cache before save:", chrome.runtime.lastError.message);
        resolve(false);
        return;
      }

      const existingCache = result?.[AI_CACHE_STORAGE_KEY] || {};
      const normalizedCount = Number.isFinite(count)
        ? count
        : countTestCasesFromOutput(output);

      const updatedCache = {
        ...existingCache,
        [cacheKey]: {
          output,
          count: normalizedCount,
          updatedAt: Date.now(),
        },
      };

      const trimmedCache = {};
      Object.keys(updatedCache)
        .sort((a, b) => updatedCache[b].updatedAt - updatedCache[a].updatedAt)
        .slice(0, AI_CACHE_LIMIT)
        .forEach((key) => {
          trimmedCache[key] = updatedCache[key];
        });

      chrome.storage.local.set({ [AI_CACHE_STORAGE_KEY]: trimmedCache }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[QA Extension] Failed to save AI cache:", chrome.runtime.lastError.message);
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  });
}

// Clear all persisted AI cache entries.
function clearCachedAiOutputs() {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve(false);
      return;
    }

    chrome.storage.local.remove([AI_CACHE_STORAGE_KEY], () => {
      if (chrome.runtime.lastError) {
        console.warn("[QA Extension] Failed to clear AI cache:", chrome.runtime.lastError.message);
        resolve(false);
        return;
      }

      resolve(true);
    });
  });
}

// Deterministic offline fallback generator when AI/cached data is unavailable.
function generateLocalTestCases(actions) {
  const normalizedActions = actions
    .map((action) => String(action || "").trim())
    .filter(Boolean)
    .slice(0, 5);

  const safeActions = normalizedActions.length > 0
    ? normalizedActions
    : ["selected requirement"];

  const testCases = [];

  safeActions.forEach((action) => {
    testCases.push({
      title: `Verify successful scenario for ${action}`,
      steps: `1. Open application\n2. Perform action: ${action}`,
      expected: "System completes action successfully",
    });

    testCases.push({
      title: `Verify validation for ${action}`,
      steps: `1. Attempt action with missing or invalid input for: ${action}`,
      expected: "System shows validation message",
    });

    testCases.push({
      title: `Verify boundary handling for ${action}`,
      steps: `1. Perform action using boundary input values for: ${action}`,
      expected: "System handles boundary values correctly",
    });

    testCases.push({
      title: `Verify unauthorized access for ${action}`,
      steps: `1. Attempt ${action} without required permissions`,
      expected: "System blocks action and shows authorization error",
    });
  });

  return testCases;
}

// Render structured test case objects into a readable text block.
function formatTestCases(testCases) {
  return testCases
    .map((tc, index) => {
      return [
        `Test Case ${index + 1}`,
        `Title: ${tc.title}`,
        `Steps:`,
        tc.steps,
        `Expected: ${tc.expected}`,
      ].join("\n");
    })
    .join("\n\n");
}

// Normalize and infer priority values for CSV export.
function normalizePriority(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return "";
}

function inferPriorityFromCase(testCase) {
  const source = [
    testCase.title,
    testCase.preconditions,
    testCase.steps,
    testCase.expected,
    testCase.testData,
  ]
    .join(" ")
    .toLowerCase();

  const highSignals = /(unauthori[sz]ed|permission|access\s+control|security|data\s+loss|fraud|payment\s+failure|compliance|critical|outage|lockout|locked|expire|expired|token|auth(?:enti|or)?|session|password\s*reset|admin|privilege|encrypt|sensitive)/i;
  const mediumSignals = /(validation|boundary|limit|max|min|invalid|error|timeout|retry|duplicate|idempotent|concurrency|format|missing|empty)/i;

  if (highSignals.test(source)) return "High";
  if (mediumSignals.test(source)) return "Medium";
  return "Low";
}

// Parse AI/plain-text output into structured fields for export.
function parseStructuredTestCases(sourceText) {
  const text = String(sourceText || "").trim();
  if (!text) return [];

  const blocks = text
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block, index) => {
      const lines = block.split("\n").map((line) => line.trim());
      const parsed = {
        caseNumber: index + 1,
        title: "",
        preconditions: "",
        priority: "",
        steps: "",
        expected: "",
        testData: "",
      };

      const stepLines = [];
      let inSteps = false;

      lines.forEach((line) => {
        if (!line) return;

        const caseNumberMatch = line.match(/^test\s*case\s*[:#-]?\s*(\d+)/i);
        if (caseNumberMatch) {
          parsed.caseNumber = Number(caseNumberMatch[1]) || parsed.caseNumber;
          inSteps = false;
          return;
        }

        const titleMatch = line.match(/^title\s*:\s*(.+)$/i);
        if (titleMatch) {
          parsed.title = titleMatch[1].trim();
          inSteps = false;
          return;
        }

        const preconditionsMatch = line.match(/^preconditions\s*:\s*(.+)$/i);
        if (preconditionsMatch) {
          parsed.preconditions = preconditionsMatch[1].trim();
          inSteps = false;
          return;
        }

        const priorityMatch = line.match(/^priority\s*:\s*(.+)$/i);
        if (priorityMatch) {
          parsed.priority = normalizePriority(priorityMatch[1]);
          inSteps = false;
          return;
        }

        const testDataMatch = line.match(/^test\s*data\s*:\s*(.+)$/i);
        if (testDataMatch) {
          const value = testDataMatch[1].trim();
          parsed.testData = value; // preserve literal values (including N/A) from AI output
          inSteps = false;
          return;
        }

        const expectedMatch = line.match(/^expected\s*:\s*(.+)$/i);
        if (expectedMatch) {
          parsed.expected = expectedMatch[1].trim();
          inSteps = false;
          return;
        }

        if (/^steps\s*:?$/i.test(line)) {
          inSteps = true;
          return;
        }

        if (inSteps) {
          stepLines.push(line.replace(/^\d+[.)-]\s*/, "").trim());
        }
      });

      if (stepLines.length > 0) {
        parsed.steps = stepLines
          .filter(Boolean)
          .map((step, stepIndex) => `${stepIndex + 1}. ${step}`)
          .join("\n");
      }

      if (!parsed.priority) {
        parsed.priority = inferPriorityFromCase(parsed);
      }

      // Ensure Test Data column is explicit when not provided
      if (!parsed.testData) {
        parsed.testData = "N/A";
      }

      return parsed;
    })
    .filter((testCase) => testCase.title || testCase.steps || testCase.expected);
}

// Clamp desired count to a safe range for generation requests.
function normalizeDesiredCaseCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.min(30, Math.max(1, Math.floor(numeric)));
}

// Build a stricter prompt to improve output consistency.
function buildAiRequestPrompt(requirementText, desiredCaseCount, deterministic) {
  const modeLine = deterministic
    ? "Use deterministic, consistent wording and ordering."
    : "Use clear and concise wording.";

  const edgeCaseTarget = Math.max(1, Math.ceil(desiredCaseCount * 0.3));

  return [
    requirementText,
    "",
    `Generate exactly ${desiredCaseCount} QA test case(s).`,
    `Include at least ${edgeCaseTarget} edge case(s) that cover boundary values, invalid/missing inputs, authorization, and unusual user flow sequencing where applicable.`,
    modeLine,
    "Output must be plain text only. No markdown headings, no bullet symbols, no intro text.",
    "Set Priority for every case using only: High, Medium, or Low.",
    "Use Test Data: N/A when no concrete test data is needed.",
    "Use this exact template for every case:",
    "Test Case <number>",
    "Title: <text>",
    "Preconditions: <text>",
    "Priority: <High|Medium|Low>",
    "Steps:",
    "1. <step>",
    "2. <step>",
    "Expected: <text>",
    "Test Data: <text or N/A>",
  ].join("\n");
}

// Create and populate floating panel for AI output + fallback states.
async function createFloatingPanel(text) {
  const oldPanel = document.getElementById("qaTestPanel");
  if (oldPanel) oldPanel.remove();

  const trimmedText = String(text || "").trim();
  const actions = extractActions(trimmedText);
  const basePromptText = actions.length > 0 ? actions.join(". ") : trimmedText;

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
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.cursor = "move";
  header.style.marginBottom = "6px";

  const headerTitle = document.createElement("span");
  headerTitle.style.fontWeight = "bold";
  headerTitle.textContent = "QA Test Case Generator";

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✖";
  closeBtn.onclick = () => panel.remove();

  header.appendChild(headerTitle);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const optionsRow = document.createElement("div");
  optionsRow.style.display = "flex";
  optionsRow.style.alignItems = "center";
  optionsRow.style.gap = "8px";
  optionsRow.style.marginBottom = "8px";

  const deterministicToggle = document.createElement("input");
  deterministicToggle.type = "checkbox";
  deterministicToggle.checked = true;

  const deterministicLabel = document.createElement("label");
  deterministicLabel.textContent = "Deterministic";
  deterministicLabel.style.fontSize = "12px";

  const desiredCountLabel = document.createElement("span");
  desiredCountLabel.textContent = "Count:";
  desiredCountLabel.style.fontSize = "12px";

  const desiredCountInput = document.createElement("input");
  desiredCountInput.type = "number";
  desiredCountInput.min = "1";
  desiredCountInput.max = "30";
  desiredCountInput.value = "10";
  desiredCountInput.style.width = "56px";

  const runBtn = document.createElement("button");
  runBtn.textContent = "Generate";

  optionsRow.appendChild(deterministicToggle);
  optionsRow.appendChild(deterministicLabel);
  optionsRow.appendChild(desiredCountLabel);
  optionsRow.appendChild(desiredCountInput);
  optionsRow.appendChild(runBtn);
  panel.appendChild(optionsRow);

  const countLabel = document.createElement("div");
  countLabel.style.fontSize = "12px";
  countLabel.style.marginBottom = "8px";
  countLabel.textContent = "Generating test cases...";
  panel.appendChild(countLabel);

  let latestOutput = "";

  const pre = document.createElement("pre");
  pre.textContent = "Generating AI test cases...";

  const runGeneration = async () => {
    const deterministicMode = deterministicToggle.checked;
    const desiredCaseCount = normalizeDesiredCaseCount(desiredCountInput.value);
    desiredCountInput.value = String(desiredCaseCount);

    const aiPrompt = buildAiRequestPrompt(basePromptText, desiredCaseCount, deterministicMode);
    const cacheKey = buildCacheKey(
      `${basePromptText}::deterministic=${deterministicMode}::count=${desiredCaseCount}`
    );

    const useLocalFallback = (reason) => {
      const fallbackCases = generateLocalTestCases(actions.length > 0 ? actions : [trimmedText]);
      const fallbackCount = fallbackCases.length;

      latestOutput = formatTestCases(fallbackCases);
      pre.textContent = latestOutput;
      countLabel.textContent = `AI unavailable. Generated ${fallbackCount} local test case(s)`;
      headerTitle.textContent = `QA Test Case Generator (${fallbackCount} cases)`;

      console.warn(`[QA Extension] AI unavailable: ${reason}. Using local fallback generator.`);
      console.log(`[QA Extension] Local fallback generated ${fallbackCount} test case(s).`);
    };

    const useCachedFallback = async (reason) => {
      countLabel.textContent = "AI unavailable. Checking cached result...";
      const cached = await getCachedAiOutput(cacheKey);

      if (cached?.output) {
        latestOutput = cached.output;
        const cachedCountValue = Number(cached.count);
        const inferredCachedCount = countTestCasesFromOutput(latestOutput);
        const cachedCount = Math.max(
          Number.isFinite(cachedCountValue) ? cachedCountValue : 0,
          inferredCachedCount
        );

        pre.textContent = latestOutput;
        countLabel.textContent = `AI unavailable. Loaded ${cachedCount} cached test case(s)`;
        headerTitle.textContent = `QA Test Case Generator (${cachedCount} cases)`;

        console.warn(`[QA Extension] AI unavailable: ${reason}. Using cached AI test cases.`);
        console.log(`[QA Extension] Cached fallback loaded ${cachedCount} test case(s).`);
        return true;
      }

      return false;
    };

    if (deterministicMode) {
      countLabel.textContent = "Deterministic mode active. Checking pinned output...";
      const pinned = await getCachedAiOutput(cacheKey);
      if (pinned?.output) {
        latestOutput = pinned.output;
        const pinnedCount = Math.max(
          Number.isFinite(Number(pinned.count)) ? Number(pinned.count) : 0,
          countTestCasesFromOutput(latestOutput)
        );

        pre.textContent = latestOutput;
        countLabel.textContent = `Deterministic mode: loaded ${pinnedCount} cached test case(s)`;
        headerTitle.textContent = `QA Test Case Generator (${pinnedCount} cases)`;
        console.log(`[QA Extension] Deterministic cache hit: ${pinnedCount} case(s).`);
        return;
      }
    }

    countLabel.textContent = deterministicMode
      ? `Generating deterministic output (${desiredCaseCount} cases)...`
      : "Generating test cases...";
    pre.textContent = "Generating AI test cases...";

    chrome.runtime.sendMessage(
      {
        action: "generateAI",
        text: aiPrompt,
        options: {
          deterministic: deterministicMode,
          desiredCount: desiredCaseCount,
          outputFormat: "structured-text-v1",
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          void useCachedFallback("extension connection error").then((cacheUsed) => {
            if (!cacheUsed) {
              useLocalFallback("extension connection error");
            }
          });
          return;
        }

        const aiFailed =
          !response ||
          response.ok === false ||
          !response.output ||
          /^\s*AI request failed:/i.test(response.output);

        if (aiFailed) {
          void useCachedFallback(response?.error || "AI request failed").then((cacheUsed) => {
            if (!cacheUsed) {
              useLocalFallback(response?.error || "AI request failed");
            }
          });
          return;
        }

        latestOutput = response.output;
        const responseCountValue = Number(response.count);
        const inferredCount = countTestCasesFromOutput(latestOutput);
        const caseCount = Math.max(
          Number.isFinite(responseCountValue) ? responseCountValue : 0,
          inferredCount
        );

        if (caseCount > 0) {
          countLabel.textContent = deterministicMode
            ? `AI generated ${caseCount} test case(s) (target: ${desiredCaseCount})`
            : `AI generated ${caseCount} test case(s)`;
          headerTitle.textContent = `QA Test Case Generator (${caseCount} cases)`;
        } else {
          countLabel.textContent = "AI generated test cases (count unavailable)";
        }

        console.log(`[QA Extension] AI generated ${caseCount} test case(s).`);
        pre.textContent = latestOutput;

        void saveCachedAiOutput(cacheKey, latestOutput, caseCount).then((saved) => {
          if (saved) {
            console.log("[QA Extension] Cached AI result for offline fallback.");
          }
        });
      }
    );
  };

  pre.style.whiteSpace = "pre-wrap";
  pre.style.fontSize = "13px";

  panel.appendChild(pre);

  runBtn.onclick = () => {
    void runGeneration();
  };

  // Copy button
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.style.marginRight = "10px";

  copyBtn.onclick = () => {
    navigator.clipboard.writeText(pre.textContent);
  };

  panel.appendChild(copyBtn);

  // Cache clear button
  const clearCacheBtn = document.createElement("button");
  clearCacheBtn.textContent = "Clear Cache";
  clearCacheBtn.style.marginRight = "10px";

  clearCacheBtn.onclick = () => {
    const shouldClear = window.confirm("Clear cached AI test cases?");
    if (!shouldClear) {
      return;
    }

    void clearCachedAiOutputs().then((cleared) => {
      if (cleared) {
        countLabel.textContent = "AI cache cleared";
        console.log("[QA Extension] AI cache cleared by user.");
        return;
      }

      countLabel.textContent = "Unable to clear AI cache";
      console.warn("[QA Extension] AI cache clear failed.");
    });
  };

  panel.appendChild(clearCacheBtn);

  // CSV export button
  const csvBtn = document.createElement("button");
  csvBtn.textContent = "Export CSV";

  csvBtn.onclick = () => {
    const sourceText = (latestOutput || pre.textContent || "").trim();
    if (!sourceText) return;

    const parsedCases = parseStructuredTestCases(sourceText);
    const exportStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

    let csv = [
      "Test Case ID",
      "Priority",
      "Title",
      "Preconditions",
      "Steps",
      "Expected Result",
      "Test Data",
    ].join(",") + "\n";

    if (parsedCases.length > 0) {
      parsedCases.forEach((testCase, index) => {
        const testCaseId = `TC-${exportStamp}-${String(index + 1).padStart(3, "0")}`;

        const row = [
          testCaseId,
          testCase.priority || "Medium",
          testCase.title,
          testCase.preconditions,
          testCase.steps,
          testCase.expected,
          testCase.testData || "N/A",
        ];

        csv += `${row.map((value) => toCsvSafeValue(value)).join(",")}\n`;
      });
    } else {
      const fallbackId = `TC-${exportStamp}-001`;
      const row = [
        fallbackId,
        "Medium",
        "Unparsed Test Case",
        "",
        sourceText,
        "",
        "",
      ];
      csv += `${row.map((value) => toCsvSafeValue(value)).join(",")}\n`;
    }

    const blob = new Blob([csv], { type: "text/csv" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-testcases.csv";
    a.click();

    URL.revokeObjectURL(url);
  };

  panel.appendChild(csvBtn);

  document.body.appendChild(panel);
  makeDraggable(panel, header);

  void runGeneration();
}

// Make the floating panel draggable by its header bar.
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