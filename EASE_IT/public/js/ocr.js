const uploadBtn = document.querySelector("#upload-btn");
const uploadInput = document.querySelector("#upload-input");
const scanResult = document.querySelector("#scanResult");
const scanSourceModal = document.querySelector("#scanSourceModal");
const sourceOptions = document.querySelector("#sourceOptions");
const cameraPanel = document.querySelector("#cameraPanel");
const modalCameraPreview = document.querySelector("#modalCameraPreview");
const capturedImageCanvas = document.querySelector("#capturedImageCanvas");

let videoStream = null;

function toast(message, type = "info") {
  if (window.showToast) {
    window.showToast(message, type);
  } else {
    console[type === "error" ? "error" : "log"](message);
  }
}

function setStage(stage) {
  if (window.setScanStage) {
    window.setScanStage(stage);
  }
}

function openScanModal() {
  if (!scanSourceModal) {
    uploadInput.click();
    return;
  }

  scanSourceModal.classList.remove("hidden");
  scanSourceModal.setAttribute("aria-hidden", "false");
  sourceOptions.classList.remove("hidden");
  cameraPanel.classList.add("hidden");

  if (window.gsap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.fromTo(scanSourceModal, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" });
    gsap.fromTo(".modal-card", { y: 18, scale: 0.98 }, { y: 0, scale: 1, duration: 0.28, ease: "power3.out" });
  }
}

function closeScanModal() {
  stopCamera();
  if (!scanSourceModal) return;

  scanSourceModal.classList.add("hidden");
  scanSourceModal.setAttribute("aria-hidden", "true");
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }

  if (modalCameraPreview) {
    modalCameraPreview.srcObject = null;
  }
}

async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Camera is not available in this browser. Choose an image instead.", "error");
    return;
  }

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    modalCameraPreview.srcObject = videoStream;
    await modalCameraPreview.play();
    sourceOptions.classList.add("hidden");
    cameraPanel.classList.remove("hidden");
  } catch (error) {
    console.error("Camera access denied:", error);
    toast("Camera access was blocked. You can still upload a label image.", "error");
  }
}

function capturePhoto() {
  if (!modalCameraPreview || !capturedImageCanvas) return;

  const width = modalCameraPreview.videoWidth;
  const height = modalCameraPreview.videoHeight;

  if (!width || !height) {
    toast("Camera is still warming up. Try once more.", "error");
    return;
  }

  capturedImageCanvas.width = width;
  capturedImageCanvas.height = height;
  capturedImageCanvas.getContext("2d").drawImage(modalCameraPreview, 0, 0, width, height);

  const capturedImage = capturedImageCanvas.toDataURL("image/png");
  localStorage.setItem("capturedImage", capturedImage);
  stopCamera();
  closeScanModal();
  recognizeText(capturedImage);
}

function setProcessingUI() {
  setStage("processing");
  scanResult.innerHTML = `
    <div class="processing-state">
      <div class="ai-loader" aria-hidden="true"></div>
      <div>
        <h3>Reading ingredient label</h3>
        <p>EASEIT is extracting text, matching your health profile, and preparing a clear result.</p>
      </div>
    </div>
  `;
}

function extractRiskTags(lines) {
  const cautionLine = lines.find((line) => line.toLowerCase().includes("caution:"));
  if (!cautionLine) return [];

  return cautionLine
    .replace(/caution:/i, "")
    .split(/,|;/)
    .map((tag) => tag.replace(/[^\w\s()-]/g, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function renderAnalysis(responseText) {
  const lines = responseText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement("div");
  wrapper.className = "analysis-result";

  const title = document.createElement("h3");
  title.textContent = "Ingredient analysis";
  wrapper.appendChild(title);

  const lineWrap = document.createElement("div");
  lineWrap.className = "analysis-lines";

  lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = line.toLowerCase().includes("caution:") ? "analysis-line caution-line" : "analysis-line";
    row.textContent = line;
    lineWrap.appendChild(row);
  });

  wrapper.appendChild(lineWrap);

  const riskTags = extractRiskTags(lines);
  if (riskTags.length > 0) {
    const tagWrap = document.createElement("div");
    tagWrap.className = "ingredient-tags";
    riskTags.forEach((tag) => {
      const tagEl = document.createElement("span");
      tagEl.className = "ingredient-tag";
      tagEl.textContent = tag;
      tagWrap.appendChild(tagEl);
    });
    wrapper.appendChild(tagWrap);
  }

  fragment.appendChild(wrapper);
  scanResult.innerHTML = "";
  scanResult.appendChild(fragment);

  setStage("result");
  toast("Analysis ready. Tap the result to ask the assistant.", "success");

  if (window.gsap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.from(".analysis-line, .ingredient-tag", {
      opacity: 0,
      y: 12,
      duration: 0.32,
      ease: "power2.out",
      stagger: 0.04
    });
  }
}

function renderEmptyState(icon, title, detail) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const iconEl = document.createElement("i");
  iconEl.className = icon;

  const titleEl = document.createElement("p");
  titleEl.textContent = title;

  const detailEl = document.createElement("span");
  detailEl.textContent = detail;

  wrapper.append(iconEl, titleEl, detailEl);
  scanResult.innerHTML = "";
  scanResult.appendChild(wrapper);
}

async function recognizeText(imageSrc) {
  setProcessingUI();

  try {
    const token = localStorage.getItem("token");
    const healthConditions = localStorage.getItem("healthConditions") || "No health data available";
    const response = await fetch("/api/ocr/analyze", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(token ? { "Authorization": "Bearer " + token } : {})
      },
      body: JSON.stringify({ imageSrc, healthConditions })
    });

    if (!response.ok) throw new Error(`Failed to analyze image. Status: ${response.status}`);

    const data = await response.json();

    if (data.response) {
      renderAnalysis(data.response);
    } else {
      setStage("scan");
      renderEmptyState("fas fa-circle-exclamation", "No meaningful response received.", "Try a clearer image with the full ingredients list visible.");
      toast("No readable analysis came back. Try a clearer image.", "error");
    }
  } catch (err) {
    console.error("Error in OCR Processing:", err);
    setStage("scan");
    renderEmptyState("fas fa-triangle-exclamation", "Analysis failed.", err.message);
    toast("OCR analysis failed. Check the backend and try again.", "error");
  }
}

if (uploadBtn && uploadInput && scanResult) {
  uploadBtn.addEventListener("click", openScanModal);

  document.querySelector("#quickGalleryBtn")?.addEventListener("click", () => {
    uploadInput.removeAttribute("capture");
    uploadInput.click();
  });

  document.querySelector("#chooseGalleryBtn")?.addEventListener("click", () => {
    closeScanModal();
    uploadInput.removeAttribute("capture");
    uploadInput.click();
  });

  document.querySelector("#chooseCameraBtn")?.addEventListener("click", openCamera);
  document.querySelector("#cameraCaptureBtn")?.addEventListener("click", capturePhoto);
  document.querySelector("#cameraCancelBtn")?.addEventListener("click", closeScanModal);
  document.querySelector("#closeScanModal")?.addEventListener("click", closeScanModal);

  scanSourceModal?.addEventListener("click", (event) => {
    if (event.target === scanSourceModal) closeScanModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && scanSourceModal && !scanSourceModal.classList.contains("hidden")) {
      closeScanModal();
    }
  });

  uploadInput.addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) {
      toast("Choose an image before analyzing.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      recognizeText(event.target.result);
      uploadInput.value = "";
    };
    reader.readAsDataURL(file);
  });
}
