document.addEventListener("DOMContentLoaded", () => {
  // -----------------------
  // Element refs
  // -----------------------
  const numFramesEl = document.getElementById("numFrames");
  const winSizeEl = document.getElementById("winSize");
  const simulateBtn = document.getElementById("simulateBtn");
  const clearBtn = document.getElementById("clearBtn");
  const canvas = document.getElementById("timelineCanvas");
  const ctx = canvas.getContext("2d");

  // mode/select ids
  const MODE_DEFS = [
    { name: "frameDelay", selectId: "frameDelayMode", userDiv: "frameDelayUserDiv", userNo: "frameDelayNo", kthDiv: "frameDelayKthDiv", kthNo: "frameDelayKth" },
    { name: "frameLost",  selectId: "frameLostMode",  userDiv: "frameLostUserDiv",  userNo: "frameLostNo",  kthDiv: "frameLostKthDiv",  kthNo: "frameLostKth" },
    { name: "ackDelay",   selectId: "ackDelayMode",   userDiv: "ackDelayUserDiv",   userNo: "ackDelayNo",   kthDiv: "ackDelayKthDiv",   kthNo: "ackDelayKth" },
    { name: "ackLost",    selectId: "ackLostMode",    userDiv: "ackLostUserDiv",    userNo: "ackLostNo",    kthDiv: "ackLostKthDiv",    kthNo: "ackLostKth" }
  ];

  // stats elements
  const statWin = document.getElementById("statWin");
  const statFrames = document.getElementById("statFrames");
  const statFramesPerUnit = document.getElementById("statFramesPerUnit");
  const statTimePerFrame = document.getElementById("statTimePerFrame");
  const statFrameDelay = document.getElementById("statFrameDelay");
  const statFrameLost = document.getElementById("statFrameLost");
  const statAckDelay = document.getElementById("statAckDelay");
  const statAckLost = document.getElementById("statAckLost");
  const statFramesLost = document.getElementById("statFramesLost");
  const statAcksLost = document.getElementById("statAcksLost");
  const statRetrans = document.getElementById("statRetrans");
  const statSuccess = document.getElementById("statSuccess");

  // -----------------------
  // Popup logic
  // -----------------------
  document.querySelectorAll(".top-menu button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const popupId = btn.id.replace("Btn", "Popup");
      const popup = document.getElementById(popupId);
      if (popup) popup.style.display = "block";
    });
  });
  document.querySelectorAll(".close").forEach((closeBtn) => {
    closeBtn.addEventListener("click", (e) => {
      const targetId = e.target.getAttribute("data-close");
      if (targetId) document.getElementById(targetId).style.display = "none";
    });
  });
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("popup")) e.target.style.display = "none";
  });

  // -----------------------
  // show/hide user/kth inputs
  // -----------------------
  MODE_DEFS.forEach(def => {
    const sel = document.getElementById(def.selectId);
    if (!sel) return;
    sel.addEventListener("change", () => {
      const userDiv = document.getElementById(def.userDiv);
      const kthDiv = document.getElementById(def.kthDiv);
      if (userDiv) userDiv.classList.add("hidden");
      if (kthDiv) kthDiv.classList.add("hidden");
      if (sel.value === "user" && userDiv) userDiv.classList.remove("hidden");
      if (sel.value === "kth" && kthDiv) kthDiv.classList.remove("hidden");
    });
  });

  // -----------------------
  // drawing helpers
  // -----------------------
  function drawArrowHead(x, y, angle, color) {
    const len = 8;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * Math.cos(angle - 0.35), y - len * Math.sin(angle - 0.35));
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * Math.cos(angle + 0.35), y - len * Math.sin(angle + 0.35));
    ctx.stroke();
  }

  function drawAxes(senderX, receiverX, height) {
    ctx.font = "14px Segoe UI";
    ctx.fillStyle = "#eafaff";
    ctx.fillText("Sender", senderX - 30, 22);
    ctx.fillText("Receiver", receiverX - 20, 22);
    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(senderX, 30);
    ctx.lineTo(senderX, height - 20);
    ctx.moveTo(receiverX, 30);
    ctx.lineTo(receiverX, height - 20);
    ctx.stroke();
  }

  function drawFrameLine(senderX, receiverX, y, frameNo, color, dashed) {
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(senderX, y);
    ctx.lineTo(receiverX, y + 20);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(receiverX, y + 20, Math.PI / 2, color);
    ctx.fillStyle = color;
    ctx.font = "16px Segoe UI";
    ctx.fillText(`Frame ${frameNo}`, senderX - 90, y + 5);
  }

  function drawAckLine(receiverX, senderX, y, ackNo, color, dashed) {
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(receiverX, y);
    ctx.lineTo(senderX, y + 20);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(senderX, y + 20, -Math.PI / 2, color);
    ctx.fillStyle = color;
    ctx.font = "16px Segoe UI";
    ctx.fillText(`ACK ${ackNo}`, receiverX + 10, y + 5);
  }

  // -----------------------
  // mode helpers
  // -----------------------
  function readMode(def) {
    const sel = document.getElementById(def.selectId);
    if (!sel) return { type: "none", value: 0 };
    const type = sel.value;
    if (type === "user") {
      const v = parseInt(document.getElementById(def.userNo).value || "0", 10);
      return { type, value: Math.max(1, v) };
    } else if (type === "kth") {
      const v = parseInt(document.getElementById(def.kthNo).value || "2", 10);
      return { type, value: Math.max(2, v) };
    } else return { type, value: 0 };
  }

  // -----------------------
  // simulation core
  // -----------------------
  let running = false;

  function simulate() {
    if (running) return;
    running = true;

    const totalFrames = Math.max(1, parseInt(numFramesEl.value || "8", 10));
    const winSize = 1;
    winSizeEl.value = winSize;

    const frameDelayMode = readMode(MODE_DEFS[0]);
    const frameLostMode  = readMode(MODE_DEFS[1]);
    const ackDelayMode   = readMode(MODE_DEFS[2]);
    const ackLostMode    = readMode(MODE_DEFS[3]);

    // stats
    statWin.textContent = winSize;
    statFrames.textContent = totalFrames;
    statFrameDelay.textContent = frameDelayMode.type;
    statFrameLost.textContent = frameLostMode.type;
    statAckDelay.textContent = ackDelayMode.type;
    statAckLost.textContent = ackLostMode.type;

    const rowHeight = 90;
    const retransOffset = 20;
    const marginTop = 50;
    const neededHeight = marginTop + totalFrames * rowHeight * 2;
    canvas.height = Math.max(700, neededHeight);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const senderX = 200;
    const receiverX = canvas.width - 200;
    drawAxes(senderX, receiverX, canvas.height);

    let framesLost = 0, acksLost = 0, retrans = 0, success = 0;
    let y = marginTop;

    // Track one-time user losses
    const usedUserLoss = { frame: new Set(), ack: new Set() };

    function trigger(mode, index, attempt, type) {
      if (!mode) return false;
      if (mode.type === "none") return false;

      if (mode.type === "random") return Math.random() < 0.25;

      if (mode.type === "user") {
        if (index === mode.value && !usedUserLoss[type].has(index)) {
          usedUserLoss[type].add(index);
          return true;
        }
        return false;
      }

      if (mode.type === "kth") {
        const key = `${type}-${index}`;
        if (index % mode.value === 0 && !usedUserLoss[type].has(key)) {
          usedUserLoss[type].add(key);
          return true;
        }
        return false;
      }

      return false;
    }

    let currentFrame = 1;
    let attempt = 1;

    function processFrame() {
      if (!running) return;

      const attemptY = y + (attempt - 1) * retransOffset;

      const frameLost = trigger(frameLostMode, currentFrame, attempt, "frame");
      const frameDelay = trigger(frameDelayMode, currentFrame, attempt, "frame");
      const ackLost = trigger(ackLostMode, currentFrame, attempt, "ack");
      const ackDelay = trigger(ackDelayMode, currentFrame, attempt, "ack");

      const frameColor = frameLost ? "#ff6b6b" : attempt === 1 ? "#00ffff" : "#ffb347";
      const ackColor = ackLost ? "#ff9f43" : "#4faaff";
      const frameDashed = frameLost || attempt > 1;
      const ackDashed = ackLost;

      const frameDelayTime = frameDelay ? 1000 : 300;
      const ackDelayTime = ackDelay ? 1000 : 400;

      console.log(`▶️ Sending Frame ${currentFrame} (attempt ${attempt})`);
      drawFrameLine(senderX, receiverX, attemptY, currentFrame, frameColor, frameDashed);

      if (frameLost) {
        framesLost++;
        retrans++;
        console.log(`❌ Frame ${currentFrame} lost, retransmitting...`);
        setTimeout(() => {
          attempt++;
          processFrame();
        }, frameDelayTime + 800);
        return;
      }

      setTimeout(() => {
        console.log(`📩 Receiver got Frame ${currentFrame}, sending ACK ${currentFrame}`);
        drawAckLine(receiverX, senderX, attemptY + 40, currentFrame, ackColor, ackDashed);

        if (ackLost) {
          acksLost++;
          retrans++;
          console.log(`❌ ACK ${currentFrame} lost, retransmitting frame...`);
          setTimeout(() => {
            attempt++;
            processFrame();
          }, ackDelayTime + 800);
          return;
        }

        success++;
        console.log(`✅ Frame ${currentFrame} acknowledged`);
        y += rowHeight;
        currentFrame++;
        attempt = 1;

        if (currentFrame > totalFrames) {
          statFramesLost.textContent = framesLost;
          statAcksLost.textContent = acksLost;
          statRetrans.textContent = retrans;
          statSuccess.textContent = success;
          running = false;
          console.log("✅ Simulation complete");
          return;
        }

        setTimeout(processFrame, ackDelayTime + 400);
      }, frameDelayTime + ackDelayTime);
    }

    processFrame();
  }

  // -----------------------
  // simulate / clear
  // -----------------------
  simulateBtn.addEventListener("click", simulate);

  clearBtn.addEventListener("click", () => {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    statWin.textContent = "-";
    statFrames.textContent = "-";
    statFrameDelay.textContent = "-";
    statFrameLost.textContent = "-";
    statAckDelay.textContent = "-";
    statAckLost.textContent = "-";
    statFramesLost.textContent = "0";
    statAcksLost.textContent = "0";
    statRetrans.textContent = "0";
    statSuccess.textContent = "0";
    canvas.height = 700;
  });

  if (!ctx) {
    simulateBtn.disabled = true;
    clearBtn.disabled = true;
    alert("Your browser does not support canvas 2D context.");
  }

  document.getElementById("downloadBtn").addEventListener("click", function () {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text("Sliding Window Protocol Simulation Report", 14, 20);

    // User Inputs
    doc.setFontSize(12);
    doc.text("User Inputs:", 14, 30);

    const inputs = [
        ["Number of Frames (N):", document.getElementById("numFrames").value],
        ["Window Size (W):", document.getElementById("winSize").value],
        ["Frame Delay Mode:", document.getElementById("frameDelayMode").value],
        ["Frame Lost Mode:", document.getElementById("frameLostMode").value],
        ["ACK Delay Mode:", document.getElementById("ackDelayMode").value],
        ["ACK Lost Mode:", document.getElementById("ackLostMode").value]
    ];

    let y = 36;
    inputs.forEach(row => {
        doc.text(`${row[0]} ${row[1]}`, 14, y);
        y += 6;
    });

    // Add Timeline Canvas Image
    const canvas = document.getElementById("timelineCanvas");
    if (canvas) {
        const imgData = canvas.toDataURL("image/png");
        const imgWidth = 180; // Width in PDF units (mm)
        const imgHeight = (canvas.height / canvas.width) * imgWidth;
        y += 6; // Small space before image
        doc.addImage(imgData, "PNG", 14, y, imgWidth, imgHeight);
        y += imgHeight + 10; // Move Y position after image
    }

    // Statistics Table
    const statsData = [
        ["Window Size", document.getElementById("statWin").innerText],
        ["Total Frames", document.getElementById("statFrames").innerText],
        ["Frames per Unit", document.getElementById("statFramesPerUnit").innerText],
        ["Time per Frame (units)", document.getElementById("statTimePerFrame").innerText],
        ["Frame Delay Mode", document.getElementById("statFrameDelay").innerText],
        ["Frame Lost Mode", document.getElementById("statFrameLost").innerText],
        ["ACK Delay Mode", document.getElementById("statAckDelay").innerText],
        ["ACK Lost Mode", document.getElementById("statAckLost").innerText],
        ["Frames Lost", document.getElementById("statFramesLost").innerText],
        ["ACKs Lost", document.getElementById("statAcksLost").innerText],
        ["Retransmissions", document.getElementById("statRetrans").innerText],
        ["Successful Frames", document.getElementById("statSuccess").innerText]
    ];

    doc.autoTable({
        startY: y,
        head: [["Statistic", "Value"]],
        body: statsData,
        theme: "grid",
        headStyles: { fillColor: [0, 255, 255], textColor: 0 },
        styles: { cellPadding: 3, fontSize: 10 }
    });

    doc.save("SlidingWindowReport.pdf");
  });

});
