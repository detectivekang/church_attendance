/* =========================================================
   [교체] Firebase → Supabase
   - 이 파일 하나가 예전 firebase-init.js를 완전히 대신합니다.
   - db / auth / churchCol() / churchDocRef() / ADMIN_EMAIL 을
     예전과 "똑같은 이름, 똑같은 사용법"으로 다시 만들어서,
     나머지 js 파일(categories.js, groups.js, members.js,
     attendance.js, notices.js, excel.js, auth.js ...)은
     단 한 줄도 고치지 않아도 그대로 동작합니다.
   - 실제 데이터는 Supabase(Postgres)의 fs_documents 테이블에
     Firestore와 비슷한 모양({path, parent, collection, doc_id, data})
     으로 저장됩니다. (supabase-schema.sql 참고)
   ========================================================= */

/* [수정 필요] 아래 두 값을 Supabase 프로젝트의 값으로 바꿔주세요.
   Supabase 대시보드 → Project Settings → API 에서 확인 가능합니다. */
const SUPABASE_URL = "https://gjtavbhpqgertaqdxbbk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Yn3lJNQj2leqFfFL0-_LXQ_4Wxx2J-b";

const ADMIN_EMAIL = "kangseabich@naver.com";

/* [복구] 새 교회에 발급할 가입 코드 (대문자+숫자 6자리, 헷갈리는 0/O/1/I 제외)
   - Firebase/Supabase와 무관한 순수 앱 로직인데, firebase-init.js에서
     supabase-init.js로 옮기면서 실수로 빠졌던 함수 */
function generateChurchCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ---------------------------------------------------------
   유틸: 경로/ID 생성
   --------------------------------------------------------- */
function fsGenId() {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}
function fsPath(parent, collection, id) {
  return parent ? `${parent}/${collection}/${id}` : `${collection}/${id}`;
}

/* ---------------------------------------------------------
   문서 스냅샷 / 쿼리 스냅샷 (Firestore DocumentSnapshot/QuerySnapshot 흉내)
   --------------------------------------------------------- */
function makeDocSnapshot(ref, row) {
  return {
    id: ref.id,
    ref,
    exists: !!row,
    data: () => (row ? row.data : undefined),
    _version: row ? row.updated_at : null,
  };
}
function makeQuerySnapshot(rows, parent, collection) {
  const docs = rows.map((r) =>
    makeDocSnapshot(makeDocRef(parent, collection, r.doc_id), r),
  );
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach(fn) {
      docs.forEach(fn);
    },
  };
}

/* ---------------------------------------------------------
   DocumentReference
   --------------------------------------------------------- */
function makeDocRef(parent, collection, id) {
  const path = fsPath(parent, collection, id);
  return {
    id,
    path,
    parent,
    collection,
    async get() {
      const { data: row, error } = await sb
        .from("fs_documents")
        .select("doc_id,data,updated_at")
        .eq("path", path)
        .maybeSingle();
      if (error) throw error;
      return makeDocSnapshot(this, row);
    },
    async set(data, opts) {
      const merge = !!(opts && opts.merge);
      const { error } = await sb.rpc("fs_batch", {
        p_ops: [
          {
            op: "set",
            path,
            parent,
            collection,
            doc_id: id,
            data,
            merge,
          },
        ],
      });
      if (error) throw error;
    },
    async update(data) {
      const { error } = await sb.rpc("fs_batch", {
        p_ops: [{ op: "update", path, parent, collection, doc_id: id, data }],
      });
      if (error) throw error;
    },
    async delete() {
      const { error } = await sb.rpc("fs_batch", {
        p_ops: [{ op: "delete", path, parent, collection, doc_id: id }],
      });
      if (error) throw error;
    },
  };
}

/* ---------------------------------------------------------
   CollectionReference (where/orderBy/limit/doc/add/get 지원)
   - 기존 코드가 쓰는 범위(단일 where, 단일 orderBy, limit)만 지원
   --------------------------------------------------------- */
function makeCollectionRef(parent, collection) {
  const filters = [];
  let orderField = null;
  let orderDesc = false;
  let limitN = null;

  const self = {
    where(field, op, val) {
      if (op !== "==") {
        throw new Error("지원하지 않는 쿼리 연산자입니다: " + op);
      }
      filters.push([field, val]);
      return self;
    },
    orderBy(field, dir) {
      orderField = field;
      orderDesc = dir === "desc";
      return self;
    },
    limit(n) {
      limitN = n;
      return self;
    },
    doc(id) {
      /* users/roles 컬렉션은 이메일을 문서 ID로 씀. Supabase Auth는
         이메일을 소문자로 정규화해서 다루므로, 여기서도 미리 소문자로
         맞춰두지 않으면 대문자 섞인 이메일로 가입한 사람이 다음 로그인 때
         자기 문서를 못 찾는 문제가 생김 */
      const normalizedId =
        id && (collection === "users" || collection === "roles")
          ? id.toLowerCase()
          : id;
      return makeDocRef(parent, collection, normalizedId || fsGenId());
    },
    async add(data) {
      const ref = self.doc();
      await ref.set(data, { merge: false });
      return ref;
    },
    async get() {
      let q = sb
        .from("fs_documents")
        .select("doc_id,data,updated_at")
        .eq("parent", parent)
        .eq("collection", collection);
      filters.forEach(([field, val]) => {
        q = q.eq(`data->>${field}`, val);
      });
      if (orderField) {
        q = q.order(`data->>${orderField}`, { ascending: !orderDesc });
      }
      if (limitN) q = q.limit(limitN);
      const { data: rows, error } = await q;
      if (error) throw error;
      return makeQuerySnapshot(rows, parent, collection);
    },
  };
  return self;
}

/* ---------------------------------------------------------
   db (firebase.firestore() 흉내)
   --------------------------------------------------------- */
const db = {
  collection(name) {
    return makeCollectionRef("", name);
  },
  batch() {
    const ops = [];
    return {
      set(ref, data, opts) {
        ops.push({
          op: "set",
          path: ref.path,
          parent: ref.parent,
          collection: ref.collection,
          doc_id: ref.id,
          data,
          merge: !!(opts && opts.merge),
        });
      },
      update(ref, data) {
        ops.push({
          op: "update",
          path: ref.path,
          parent: ref.parent,
          collection: ref.collection,
          doc_id: ref.id,
          data,
        });
      },
      delete(ref) {
        ops.push({
          op: "delete",
          path: ref.path,
          parent: ref.parent,
          collection: ref.collection,
          doc_id: ref.id,
        });
      },
      async commit() {
        if (!ops.length) return;
        const { error } = await sb.rpc("fs_batch", { p_ops: ops });
        if (error) throw error;
      },
    };
  },
  /* [신규] Firestore의 runTransaction과 동일한 사용법(t.get/t.set/t.update)을
     지원하되, 내부적으로는 낙관적 동시성 제어(CAS) + 재시도로 구현됨.
     동시에 같은 문서를 건드리는 경우가 매우 드문 앱(교회 규모)이라
     실무적으로 충분합니다. */
  async runTransaction(updateFn) {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const versions = {};
      const ops = [];
      const t = {
        async get(ref) {
          const snap = await ref.get();
          versions[ref.path] = snap._version;
          return snap;
        },
        set(ref, data, opts) {
          ops.push({
            op: "set",
            path: ref.path,
            parent: ref.parent,
            collection: ref.collection,
            doc_id: ref.id,
            data,
            merge: !!(opts && opts.merge),
            expected: Object.prototype.hasOwnProperty.call(versions, ref.path)
              ? versions[ref.path]
              : null,
          });
        },
        update(ref, data) {
          ops.push({
            op: "update",
            path: ref.path,
            parent: ref.parent,
            collection: ref.collection,
            doc_id: ref.id,
            data,
            expected: versions[ref.path] ?? null,
          });
        },
      };
      await updateFn(t);
      const { error } = await sb.rpc("fs_cas_batch", { p_ops: ops });
      if (!error) return;
      if (error.message && error.message.includes("CAS_CONFLICT")) {
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
        continue;
      }
      throw error;
    }
    throw new Error(
      "다른 곳에서 동시에 같은 데이터를 수정하고 있어 처리하지 못했습니다. 다시 시도해주세요.",
    );
  },
};

function churchCol(name) {
  return makeCollectionRef("churches/" + currentChurchId, name);
}
function churchDocRef() {
  return makeDocRef("", "churches", currentChurchId);
}

/* ---------------------------------------------------------
   auth (firebase.auth() 흉내)
   --------------------------------------------------------- */
function fsToFirebaseUser(session) {
  if (!session || !session.user) return null;
  const supaUser = session.user;
  return {
    email: supaUser.email,
    uid: supaUser.id,
    async getIdToken(forceRefresh) {
      if (forceRefresh) {
        const { data } = await sb.auth.refreshSession();
        return data.session ? data.session.access_token : null;
      }
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.access_token : null;
    },
  };
}

/* Supabase의 에러 메시지를 기존 translateAuthError()가 이해하는
   Firebase 스타일 코드("auth/xxx")로 변환 - auth.js는 그대로 둠 */
function fsMapAuthError(err) {
  const msg = (err && err.message) || "";
  const map = [
    [/invalid login credentials/i, "auth/invalid-credential"],
    [/email not confirmed/i, "auth/invalid-credential"],
    [
      /user already registered|already registered/i,
      "auth/email-already-in-use",
    ],
    [/password should be at least/i, "auth/weak-password"],
    [/unable to validate email|invalid email/i, "auth/invalid-email"],
    [/user not found/i, "auth/user-not-found"],
  ];
  const hit = map.find(([re]) => re.test(msg));
  const mapped = new Error(msg);
  mapped.code = hit ? hit[1] : "auth/unknown";
  return mapped;
}

const auth = {
  currentUser: null,
  _listeners: [],

  async signInWithEmailAndPassword(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw fsMapAuthError(error);
  },

  async createUserWithEmailAndPassword(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw fsMapAuthError(error);
    if (!data.session) {
      /* Supabase 프로젝트의 "Confirm email" 설정이 켜져 있으면 가입 직후
         바로 로그인 세션이 생기지 않음(이메일 인증 대기). 이 앱은 가입과
         동시에 여러 문서를 이어서 쓰는 구조라 반드시 즉시 로그인돼야
         하므로, Supabase 대시보드에서 이 옵션을 꺼두어야 합니다
         (Authentication → Providers → Email → Confirm email OFF). */
      throw new Error(
        "이메일 인증이 필요합니다. Supabase 프로젝트의 'Confirm email' 설정을 꺼주세요.",
      );
    }
    auth.currentUser = fsToFirebaseUser(data.session);
  },

  async signOut() {
    await sb.auth.signOut();
  },

  async sendPasswordResetEmail(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email);
    if (error) throw fsMapAuthError(error);
  },

  onAuthStateChanged(cb) {
    /* Supabase의 onAuthStateChange는 구독 시점에 현재 세션으로 한 번
       먼저 호출되고, 이후 로그인/로그아웃/토큰갱신 때마다 다시 호출됨 -
       Firebase의 onAuthStateChanged와 동일한 동작이라 별도 초기 조회는
       하지 않음(두 번 호출되는 것을 방지) */
    auth._listeners.push(cb);
    sb.auth.onAuthStateChange((_event, session) => {
      auth.currentUser = fsToFirebaseUser(session);
      cb(auth.currentUser);
    });
  },
};