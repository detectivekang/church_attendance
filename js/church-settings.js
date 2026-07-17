/* =========================================================
   [신규] 운영자 전용 '교회 설정' 탭
   - 교회 로고 이미지 업로드 (Firebase Storage)
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
   교회 로고 업로드 (Firebase Storage)
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
    if (file.size > 5 * 1024 * 1024) {
      msgEl.textContent = "5MB 이하의 이미지만 업로드할 수 있습니다.";
      msgEl.className = "settings-logo-msg error";
      return;
    }

    const label = document.getElementById("settingsLogoUploadLabel");
    label.style.pointerEvents = "none";
    msgEl.textContent = "업로드 중...";
    msgEl.className = "settings-logo-msg";
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `church-logos/${currentChurchId}/logo_${Date.now()}.${ext}`;
      const ref = storage.ref(path);
      await ref.put(file, { contentType: file.type });
      const url = await ref.getDownloadURL();

      await churchDocRef().update({ logoUrl: url });
      if (currentChurchData) currentChurchData.logoUrl = url;

      document.getElementById("settingsLogoImg").src = url;
      const coverLogoImg = document.getElementById("churchLogoImg");
      if (coverLogoImg) coverLogoImg.src = url;

      msgEl.textContent = "로고가 변경되었습니다.";
      msgEl.className = "settings-logo-msg success";
    } catch (err) {
      msgEl.textContent = "업로드 중 오류가 발생했습니다: " + err.message;
      msgEl.className = "settings-logo-msg error";
    } finally {
      label.style.pointerEvents = "";
    }
  });
