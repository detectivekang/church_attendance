/* =========================================================
   [신규] 운영자 전용 '교회 설정' 탭
   - 교회 로고 이미지 업로드 (base64로 축소해 Firestore에 직접 저장)
   - 교회 정보(이름/주소/교단/담임목사) 수정
   ========================================================= */
async function renderChurchSettingsForm() {
  const data = currentChurchData || {};

  document.getElementById("settingsLogoImg").src = data.logoUrl || "icon.jpg";
  document.getElementById("settingsChurchName").value = data.name || "";
  document.getElementById("settingsChurchAddress").value = data.address || "";
  document.getElementById("settingsChurchZonecode").value =
    data.zonecode || "";
  document.getElementById("settingsChurchAddressDetail").value =
    data.addressDetail || "";
  document.getElementById("settingsChurchPastor").value =
    data.pastorName || "";

  const denomEl = document.getElementById("settingsChurchDenomination");
  const denomEtcEl = document.getElementById("settingsChurchDenominationEtc");
  const knownDenoms = Array.from(denomEl.options).map((o) => o.value);
  if (data.denomination && !knownDenoms.includes(data.denomination)) {
    denomEl.value = "기타";
    denomEtcEl.value = data.denomination;
    denomEtcEl.style.display = "block";
  } else {
    denomEl.value = data.denomination || "";
    denomEtcEl.value = "";
    denomEtcEl.style.display = "none";
  }

  document.getElementById("settingsSaveMsg").textContent = "";
  document.getElementById("settingsSaveMsg").className = "settings-save-msg";
  document.getElementById("settingsLogoMsg").textContent = "";
  document.getElementById("settingsLogoMsg").className = "settings-logo-msg";
}

document
  .getElementById("settingsChurchDenomination")
  .addEventListener("change", (e) => {
    const etcEl = document.getElementById("settingsChurchDenominationEtc");
    etcEl.style.display = e.target.value === "기타" ? "block" : "none";
    if (e.target.value !== "기타") etcEl.value = "";
  });

/* 다음(Daum) 우편번호 검색 - 회원가입 때와 동일한 방식 */
document
  .getElementById("settingsAddressSearchBtn")
  .addEventListener("click", () => {
    if (typeof daum === "undefined" || !daum.Postcode) {
      alert("주소 검색 기능을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    new daum.Postcode({
      oncomplete: function (data) {
        document.getElementById("settingsChurchAddress").value =
          data.roadAddress || data.jibunAddress;
        document.getElementById("settingsChurchZonecode").value =
          data.zonecode;
        document.getElementById("settingsChurchAddressDetail").focus();
      },
    }).open();
  });

document
  .getElementById("settingsSaveBtn")
  .addEventListener("click", async () => {
    if (currentRole !== "admin" || !currentChurchId) return;
    const msgEl = document.getElementById("settingsSaveMsg");
    const name = document.getElementById("settingsChurchName").value.trim();
    const address = document
      .getElementById("settingsChurchAddress")
      .value.trim();
    const addressDetail = document
      .getElementById("settingsChurchAddressDetail")
      .value.trim();
    const zonecode = document.getElementById("settingsChurchZonecode").value;
    const denomEl = document.getElementById("settingsChurchDenomination");
    const denomEtcEl = document.getElementById(
      "settingsChurchDenominationEtc",
    );
    const pastorName = document
      .getElementById("settingsChurchPastor")
      .value.trim();

    if (!name || !address || !addressDetail) {
      msgEl.textContent = "교회 이름 · 주소 · 상세주소는 필수 입력입니다.";
      msgEl.className = "settings-save-msg error";
      return;
    }
    if (denomEl.value === "기타" && !denomEtcEl.value.trim()) {
      msgEl.textContent = "교단명을 직접 입력해주세요.";
      msgEl.className = "settings-save-msg error";
      return;
    }

    const nameKey = name.replace(/\s+/g, "").toLowerCase();
    const addressKey = `${address} ${addressDetail}`
      .replace(/\s+/g, "")
      .toLowerCase();
    const denomination =
      denomEl.value === "기타" ? denomEtcEl.value.trim() : denomEl.value;

    const btn = document.getElementById("settingsSaveBtn");
    btn.disabled = true;
    btn.textContent = "저장 중...";
    msgEl.textContent = "";
    msgEl.className = "settings-save-msg";
    try {
      await churchDocRef().update({
        name,
        nameKey,
        address,
        addressDetail,
        zonecode,
        addressKey,
        denomination: denomination || null,
        pastorName: pastorName || null,
      });
      if (currentChurchData) {
        Object.assign(currentChurchData, {
          name,
          nameKey,
          address,
          addressDetail,
          zonecode,
          addressKey,
          denomination: denomination || null,
          pastorName: pastorName || null,
        });
      }
      await loadChurchName();
      msgEl.textContent = "저장되었습니다.";
      msgEl.className = "settings-save-msg success";
    } catch (err) {
      msgEl.textContent = "저장 중 오류가 발생했습니다: " + err.message;
      msgEl.className = "settings-save-msg error";
    } finally {
      btn.disabled = false;
      btn.textContent = "저장";
    }
  });

/* =========================================================
   교회 로고 업로드
   - Firebase Storage를 쓰지 않고, 업로드된 이미지를 캔버스로
     축소해 base64(Data URL) 문자열로 만들어 교회 문서(logoUrl)에
     바로 저장한다. Firestore 문서 하나의 크기 제한(1MB)을 고려해
     최대 512px, 700KB 이내로 줄어들지 않으면 업로드를 거부한다.
   ========================================================= */
document
  .getElementById("settingsLogoUploadInput")
  .addEventListener("change", async (e) => {
    if (currentRole !== "admin" || !currentChurchId) return;
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    const msgEl = document.getElementById("settingsLogoMsg");
    if (!file.type.startsWith("image/")) {
      msgEl.textContent = "이미지 파일만 업로드할 수 있습니다.";
      msgEl.className = "settings-logo-msg error";
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      msgEl.textContent =
        "원본 파일이 너무 큽니다. 15MB 이하 이미지를 사용해주세요.";
      msgEl.className = "settings-logo-msg error";
      return;
    }

    const label = document.getElementById("settingsLogoUploadLabel");
    label.style.pointerEvents = "none";
    msgEl.textContent = "이미지 처리 중...";
    msgEl.className = "settings-logo-msg";
    try {
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const dataUrl = await resizeImageToDataUrl(file, 512, outputType);

      /* base64는 원본 바이트보다 약 4/3배 커지므로 역산해서 크기를 점검 */
      const approxBytes = Math.ceil((dataUrl.length * 3) / 4);
      if (approxBytes > 700 * 1024) {
        msgEl.textContent =
          "이미지를 충분히 줄이지 못했습니다. 더 단순하거나 작은 이미지를 사용해주세요.";
        msgEl.className = "settings-logo-msg error";
        return;
      }

      await churchDocRef().update({ logoUrl: dataUrl });
      if (currentChurchData) currentChurchData.logoUrl = dataUrl;

      document.getElementById("settingsLogoImg").src = dataUrl;
      const coverLogoImg = document.getElementById("churchLogoImg");
      if (coverLogoImg) coverLogoImg.src = dataUrl;

      msgEl.textContent = "로고가 변경되었습니다.";
      msgEl.className = "settings-logo-msg success";
    } catch (err) {
      msgEl.textContent = "이미지 처리 중 오류가 발생했습니다: " + err.message;
      msgEl.className = "settings-logo-msg error";
    } finally {
      label.style.pointerEvents = "";
    }
  });

/* 업로드한 이미지 파일을 캔버스에 그려 maxSize(긴 변 기준) 이하로
   축소한 뒤 base64 Data URL로 변환. PNG는 투명배경 유지를 위해
   PNG로, 그 외에는 용량이 작은 JPEG(품질 0.85)로 저장한다. */
function resizeImageToDataUrl(file, maxSize, outputType) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(outputType, 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
