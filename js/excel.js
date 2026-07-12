/* =========================================================
   엑셀 업로드 / 다운로드
   ========================================================= */

/* 팀원 명부 엑셀 다운로드 (팀장 가상 항목은 실제 팀원이 아니므로 제외) */
document
  .getElementById("downloadMembersExcelBtn")
  .addEventListener("click", () => {
    if (!currentGroupData) return;
    const rosterMembers = members.filter((m) => !m.isLeader);
    const rows = [["이름", "생일"]];
    rosterMembers.forEach((m) => rows.push([m.name, m.birthday || ""]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "팀원명부");
    XLSX.writeFile(wb, `${currentGroupData.name}_팀원명부.xlsx`);
  });

/* 양식 파일 다운로드 */
document
  .getElementById("excelTemplateDownloadLink")
  .addEventListener("click", (e) => {
    e.preventDefault();
    const rows = [
      ["이름", "생일"],
      ["홍길동", "1990-01-15"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "양식");
    XLSX.writeFile(wb, "팀원등록_양식.xlsx");
  });

/* ---------------------------------------------------------
   [1] 팀원 명부 엑셀 업로드 (일괄 등록) - 서버(Firestore)에 반영
   --------------------------------------------------------- */
let excelParsedRows = [];

function resetExcelUploadModal() {
  excelParsedRows = [];
  document.getElementById("excelUploadInput").value = "";
  document.getElementById("excelUploadPreviewWrap").style.display = "none";
  document.getElementById("excelUploadPreview").innerHTML = "";
  document.getElementById("excelUploadCount").textContent = "0";
  document.getElementById("excelUploadSave").disabled = true;
}

document
  .getElementById("openMemberExcelUploadBtn")
  .addEventListener("click", () => {
    if (!canManageMembers()) return;
    resetExcelUploadModal();
    document.getElementById("excelUploadOverlay").style.display = "flex";
  });

document.getElementById("excelUploadCancel").addEventListener("click", () => {
  document.getElementById("excelUploadOverlay").style.display = "none";
  resetExcelUploadModal();
});

document
  .getElementById("excelUploadInput")
  .addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        excelParsedRows = rows
          .map((r) => {
            const name = String(
              r["이름"] ?? r["name"] ?? r["Name"] ?? "",
            ).trim();
            const birthdayRaw =
              r["생일"] ?? r["birthday"] ?? r["Birthday"] ?? "";
            const birthday = normalizeDateCell(birthdayRaw);
            return { name, birthday };
          })
          .filter((r) => r.name);

        const previewEl = document.getElementById("excelUploadPreview");
        if (excelParsedRows.length === 0) {
          previewEl.innerHTML =
            '<div class="modal-none">인식된 데이터가 없습니다. "이름" 열이 있는지 확인해주세요.</div>';
        } else {
          previewEl.innerHTML = excelParsedRows
            .map(
              (r) =>
                `<div class="excel-preview-row"><span>${escapeHtml(r.name)}</span><span>${escapeHtml(r.birthday || "-")}</span></div>`,
            )
            .join("");
        }
        document.getElementById("excelUploadCount").textContent =
          excelParsedRows.length;
        document.getElementById("excelUploadPreviewWrap").style.display =
          "block";
        document.getElementById("excelUploadSave").disabled =
          excelParsedRows.length === 0;
      } catch (err) {
        alert("엑셀 파일을 읽는 중 오류가 발생했습니다: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

document.getElementById("excelUploadSave").addEventListener("click", async () => {
  if (!canManageMembers() || excelParsedRows.length === 0) return;
  const btn = document.getElementById("excelUploadSave");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "등록 중...";
  try {
    const batch = db.batch();
    excelParsedRows.forEach((r) => {
      const ref = db.collection("members").doc();
      batch.set(ref, {
        name: r.name,
        birthday: r.birthday || null,
        groupId: selectedGroupId,
        createdAt: Date.now(),
      });
    });
    await batch.commit();
    document.getElementById("excelUploadOverlay").style.display = "none";
    resetExcelUploadModal();
    await loadMembers(selectedGroupId);
    renderMembers();
    renderAttendList();
    renderStats();
    alert("팀원이 일괄 등록되었습니다.");
  } catch (err) {
    alert("등록 중 에러가 발생했습니다: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

/* ---------------------------------------------------------
   출석부 엑셀 다운로드 (팀원 x 예배일 매트릭스, 팀장 출석 관리가
   켜져 있으면 팀장도 포함되어 함께 다운로드됨)
   --------------------------------------------------------- */
document
  .getElementById("downloadStatsExcelBtn")
  .addEventListener("click", () => {
    if (!currentGroupData) return;
    const sorted = [...services].sort((a, b) => a.date.localeCompare(b.date));
    const showDonation = !!currentGroupData.trackDonation;
    const showBible = !!currentGroupData.trackBible;

    const attHeader = ["이름", ...sorted.map((s) => s.date)];
    const attRows = [attHeader];
    members.forEach((m) => {
      const row = [m.name];
      sorted.forEach((s) => {
        const rec = normalizeRecord((attendance[s.id] || {})[m.id]);
        row.push(rec.present ? "O" : "");
      });
      attRows.push(row);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(attRows),
      "출석",
    );

    if (showDonation) {
      const donRows = [attHeader];
      members.forEach((m) => {
        const row = [m.name];
        sorted.forEach((s) => {
          const rec = normalizeRecord((attendance[s.id] || {})[m.id]);
          row.push(rec.donation || "");
        });
        donRows.push(row);
      });
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(donRows),
        "헌금",
      );
    }

    if (showBible) {
      const bibleRows = [attHeader];
      members.forEach((m) => {
        const row = [m.name];
        sorted.forEach((s) => {
          const rec = normalizeRecord((attendance[s.id] || {})[m.id]);
          row.push(rec.bible || "");
        });
        bibleRows.push(row);
      });
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(bibleRows),
        "성경",
      );
    }

    XLSX.writeFile(
      wb,
      `${currentGroupData.name}_출석부_${selectedYear}.xlsx`,
    );
  });

/* ---------------------------------------------------------
   [2] 출석부 엑셀 업로드 (신규) - 다운로드 양식 그대로 올리면
   이름 x 날짜 매트릭스를 읽어 서버(Firestore attendance)에 반영.
   '출석' 시트는 O 표시 -> present, '헌금'/'성경' 시트는 숫자를
   그대로 반영. 시트가 없으면 해당 항목은 건드리지 않음.
   --------------------------------------------------------- */
let attendancePlan = null; // { bySerivce: Map, memberMatched, memberUnmatched, dateMatched, dateUnmatched }

function resetAttendanceUploadModal() {
  attendancePlan = null;
  document.getElementById("attendanceUploadInput").value = "";
  document.getElementById("attendanceUploadPreviewWrap").style.display =
    "none";
  document.getElementById("attendanceUploadPreview").innerHTML = "";
  document.getElementById("attendanceUploadSummary").innerHTML = "";
  document.getElementById("attendanceUploadSave").disabled = true;
}

document
  .getElementById("openAttendanceExcelUploadBtn")
  .addEventListener("click", () => {
    if (!canEditAttendance()) return;
    resetAttendanceUploadModal();
    document.getElementById("attendanceUploadOverlay").style.display = "flex";
  });

document
  .getElementById("attendanceUploadCancel")
  .addEventListener("click", () => {
    document.getElementById("attendanceUploadOverlay").style.display = "none";
    resetAttendanceUploadModal();
  });

/* 시트 하나를 이름x날짜 맵으로 파싱: { [memberId]: { [serviceId]: rawCellValue } } + 매칭 통계 */
function parseAttendanceMatrixSheet(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return null;
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (aoa.length === 0) return null;
  const header = aoa[0];

  // 날짜 헤더(2번째 열부터) -> 연도별로 생성한 주일 목록과 대조해 serviceId 매핑
  const yearServiceCache = {};
  function serviceIdForDate(dateStr) {
    const year = Number(dateStr.slice(0, 4));
    if (!yearServiceCache[year]) {
      yearServiceCache[year] = generateSundaysForYear(year);
    }
    const found = yearServiceCache[year].find((s) => s.date === dateStr);
    return found ? found.id : null;
  }

  const colToService = {}; // colIndex -> serviceId
  let dateMatched = 0;
  let dateUnmatched = 0;
  for (let c = 1; c < header.length; c++) {
    const dateStr = normalizeDateCell(header[c]);
    const serviceId = dateStr ? serviceIdForDate(dateStr) : null;
    if (serviceId) {
      colToService[c] = serviceId;
      dateMatched++;
    } else {
      dateUnmatched++;
    }
  }

  const byMemberService = {}; // memberId -> { serviceId: rawValue }
  let memberMatched = 0;
  let memberUnmatched = 0;
  const seenNames = new Set();
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    const name = String(row[0] || "").trim();
    if (!name) continue;
    const member = members.find((m) => m.name === name);
    if (!member) {
      memberUnmatched++;
      continue;
    }
    if (!seenNames.has(name)) {
      memberMatched++;
      seenNames.add(name);
    }
    const cellMap = {};
    Object.keys(colToService).forEach((cIdx) => {
      cellMap[colToService[cIdx]] = row[Number(cIdx)];
    });
    byMemberService[member.id] = cellMap;
  }

  return { byMemberService, dateMatched, dateUnmatched, memberMatched, memberUnmatched };
}

document
  .getElementById("attendanceUploadInput")
  .addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });

        const attSheetName = wb.SheetNames.includes("출석")
          ? "출석"
          : wb.SheetNames[0];
        const attParsed = parseAttendanceMatrixSheet(wb, attSheetName);
        const donParsed = parseAttendanceMatrixSheet(wb, "헌금");
        const bibleParsed = parseAttendanceMatrixSheet(wb, "성경");

        if (!attParsed) {
          document.getElementById("attendanceUploadPreview").innerHTML =
            '<div class="modal-none">출석 데이터를 인식하지 못했습니다. 다운로드 양식 그대로 올려주세요.</div>';
          document.getElementById("attendanceUploadPreviewWrap").style.display =
            "block";
          document.getElementById("attendanceUploadSave").disabled = true;
          attendancePlan = null;
          return;
        }

        // 서비스별로 반영할 patch 묶기: { serviceId: { memberId: {present?, donation?, bible?} } }
        const bySerivce = {};
        function ensure(serviceId, memberId) {
          if (!bySerivce[serviceId]) bySerivce[serviceId] = {};
          if (!bySerivce[serviceId][memberId])
            bySerivce[serviceId][memberId] = {};
          return bySerivce[serviceId][memberId];
        }
        Object.keys(attParsed.byMemberService).forEach((memberId) => {
          const cellMap = attParsed.byMemberService[memberId];
          Object.keys(cellMap).forEach((serviceId) => {
            const val = String(cellMap[serviceId] || "").trim();
            ensure(serviceId, memberId).present = val === "O" || val === "o";
          });
        });
        if (donParsed) {
          Object.keys(donParsed.byMemberService).forEach((memberId) => {
            const cellMap = donParsed.byMemberService[memberId];
            Object.keys(cellMap).forEach((serviceId) => {
              const num = Number(cellMap[serviceId]);
              ensure(serviceId, memberId).donation = isNaN(num)
                ? 0
                : Math.max(0, num);
            });
          });
        }
        if (bibleParsed) {
          Object.keys(bibleParsed.byMemberService).forEach((memberId) => {
            const cellMap = bibleParsed.byMemberService[memberId];
            Object.keys(cellMap).forEach((serviceId) => {
              const num = Number(cellMap[serviceId]);
              ensure(serviceId, memberId).bible = isNaN(num)
                ? 0
                : Math.min(66, Math.max(0, num));
            });
          });
        }

        const serviceCount = Object.keys(bySerivce).length;
        attendancePlan = { bySerivce };

        const summaryEl = document.getElementById("attendanceUploadSummary");
        summaryEl.innerHTML = `
          이름 매칭 <b>${attParsed.memberMatched}</b>명 (실패 ${attParsed.memberUnmatched}명) ·
          날짜 매칭 <b>${attParsed.dateMatched}</b>회 (인식 불가 ${attParsed.dateUnmatched}개)
          ${donParsed ? " · 헌금 시트 반영" : ""}${bibleParsed ? " · 성경 시트 반영" : ""}
        `;
        const previewEl = document.getElementById("attendanceUploadPreview");
        if (serviceCount === 0) {
          previewEl.innerHTML =
            '<div class="modal-none">반영할 수 있는 이름·날짜 조합이 없습니다.</div>';
          document.getElementById("attendanceUploadSave").disabled = true;
        } else {
          previewEl.innerHTML = `<div class="excel-preview-row"><span>반영될 예배 회차</span><span>${serviceCount}회</span></div>`;
          document.getElementById("attendanceUploadSave").disabled = false;
        }
        document.getElementById("attendanceUploadPreviewWrap").style.display =
          "block";
      } catch (err) {
        alert("엑셀 파일을 읽는 중 오류가 발생했습니다: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

document
  .getElementById("attendanceUploadSave")
  .addEventListener("click", async () => {
    if (!canEditAttendance() || !attendancePlan) return;
    const btn = document.getElementById("attendanceUploadSave");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "반영 중...";
    try {
      const serviceIds = Object.keys(attendancePlan.bySerivce);

      // 이미 메모리에 로드된(현재 연도) 서비스는 재사용, 아니면 새로 조회
      const fetched = await Promise.all(
        serviceIds.map((sid) =>
          attendance[sid]
            ? Promise.resolve({ exists: true, data: () => attendance[sid] })
            : db.collection("attendance").doc(sid).get(),
        ),
      );

      const batch = db.batch();
      serviceIds.forEach((sid, i) => {
        const existing = fetched[i].exists ? fetched[i].data() : {};
        const patchByMember = attendancePlan.bySerivce[sid];
        const docPatch = {};
        Object.keys(patchByMember).forEach((memberId) => {
          const cur = normalizeRecord(existing[memberId]);
          docPatch[memberId] = { ...cur, ...patchByMember[memberId] };
        });
        batch.set(db.collection("attendance").doc(sid), docPatch, {
          merge: true,
        });
        // 현재 화면에 로드된 연도라면 메모리 상태도 함께 갱신
        if (attendance[sid]) {
          attendance[sid] = { ...attendance[sid], ...docPatch };
        }
      });
      await batch.commit();

      document.getElementById("attendanceUploadOverlay").style.display =
        "none";
      resetAttendanceUploadModal();
      renderAttendList();
      renderStats();
      alert("출석부가 서버에 반영되었습니다.");
    } catch (err) {
      alert("반영 중 에러가 발생했습니다: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
