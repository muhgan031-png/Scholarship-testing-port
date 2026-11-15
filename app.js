(function () {
  'use strict';

  var C = window.PORTAL || {};
  var $ = function (id) { return document.getElementById(id); };

  var STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];
  var LEVELS = ['ND 1','ND 2','HND 1','HND 2','100 Level','200 Level','300 Level','400 Level','500 Level','600 Level','Postgraduate'];

  // Required fields here must match submit_application() in setup.sql
  var FIELDS = [
    { g: 'Personal information' },
    { k: 'full_name', l: 'Full name (as on your ID)', t: 'text', req: 1 },
    { k: 'phone', l: 'Phone number', t: 'tel', req: 1 },
    { k: 'date_of_birth', l: 'Date of birth', t: 'date', req: 1 },
    { k: 'gender', l: 'Gender', t: 'select', o: ['Male', 'Female'] },
    { k: 'state', l: 'State of origin', t: 'select', o: STATES, req: 1 },
    { k: 'lga', l: 'Local government area', t: 'text' },
    { k: 'address', l: 'Residential address', t: 'text' },
    { g: 'Academic information' },
    { k: 'institution', l: 'Institution', t: 'text', req: 1 },
    { k: 'course', l: 'Course of study', t: 'text', req: 1 },
    { k: 'department', l: 'Department', t: 'text' },
    { k: 'level', l: 'Level', t: 'select', o: LEVELS, req: 1 },
    { k: 'matric_no', l: 'Matriculation / registration number', t: 'text', req: 1 },
    { k: 'academic_session', l: 'Academic session (e.g. 2025/2026)', t: 'text' },
    { k: 'cgpa', l: 'CGPA or latest result (if any)', t: 'text' },
    { g: 'Your statement' },
    { k: 'reason', l: 'Why do you need this scholarship? (max 1000 characters)', t: 'textarea', req: 1 }
  ];

  var STATUS_LABEL = {
    draft: 'Draft (not submitted)',
    submitted: 'Submitted',
    under_review: 'Under review',
    info_required: 'More information needed',
    approved: 'Approved',
    rejected: 'Not successful',
    waitlisted: 'Waitlisted'
  };

  var sb = null, user = null, app = null, docs = [], closesAt = null, mode = 'login';

  // ---------- small helpers ----------
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function show(name) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.add('hidden');
    $('v-' + name).classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function note(id, text, ok) {
    var e = $(id);
    if (!e) return;
    e.textContent = text || '';
    e.className = 'note ' + (text ? (ok ? 'ok' : 'bad') : 'hidden');
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function fmtDate(d) {
    try {
      return new Date(d).toLocaleString('en-NG', { dateStyle: 'long', timeStyle: 'short' });
    } catch (e) {
      return String(d);
    }
  }

  function isEditable() {
    return app && (app.status === 'draft' || app.status === 'info_required');
  }

  // ---------- home page ----------
  function buildHome() {
    document.title = C.name || 'Scholarship Portal';
    $('brand').textContent = C.name || 'Scholarship Portal';
    $('org').textContent = C.organisation || '';
    $('about').textContent = C.about || '';
    $('contact').textContent = C.contact || '';
    $('foot').textContent = (C.organisation || '') + (C.TEST_MODE ? ' - test version' : '');
    if (C.TEST_MODE) $('testbar').classList.remove('hidden');

    var el = $('elig'); el.textContent = '';
    (C.eligibility || []).forEach(function (t) { el.appendChild(h('li', { text: t })); });

    var dl = $('docs-list'); dl.textContent = '';
    (C.documents || []).forEach(function (d) {
      dl.appendChild(h('li', { text: d.label + (d.required ? '' : ' (optional)') }));
    });

    var fq = $('faq'); fq.textContent = '';
    (C.faq || []).forEach(function (f) {
      fq.appendChild(h('p', {}, [h('b', { text: f.q }), h('br'), document.createTextNode(f.a)]));
    });
  }

  async function loadDeadline() {
    try {
      var r = await sb.from('app_settings').select('closes_at').eq('id', 1).maybeSingle();
      if (r.data && r.data.closes_at) {
        closesAt = new Date(r.data.closes_at);
        var open = new Date() < closesAt;
        var e = $('deadline');
        e.textContent = (open ? 'Applications close: ' : 'Applications closed: ') + fmtDate(closesAt);
        e.classList.remove('hidden');
      }
    } catch (e) { /* the deadline is only for display here */ }
  }

  // ---------- navigation ----------
  function updateNav() {
    $('nav-login').classList.toggle('hidden', !!user);
    $('nav-logout').classList.toggle('hidden', !user);
  }

  function go(name) {
    if (name === 'apply') {
      if (!user) {
        setMode('login');
        note('auth-note', 'Please log in, or create an account, to apply.', true);
        show('auth');
        return;
      }
      openApply();
      return;
    }
    if (name === 'auth') { setMode('login'); note('auth-note', ''); }
    show(name);
  }

  // ---------- login / sign up ----------
  function setMode(m) {
    mode = m;
    $('tab-login').classList.toggle('on', m === 'login');
    $('tab-signup').classList.toggle('on', m === 'signup');
    $('auth-go').textContent = m === 'login' ? 'Log in' : 'Create account';
    $('a-pass').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
    $('forgot').classList.toggle('hidden', m !== 'login');
  }

  async function doAuth() {
    var email = $('a-email').value.trim();
    var pass = $('a-pass').value;
    note('auth-note', '');
    if (!email || !pass) { note('auth-note', 'Enter your email and password.'); return; }
    var btn = $('auth-go'); btn.disabled = true;
    try {
      if (mode === 'login') {
        var r = await sb.auth.signInWithPassword({ email: email, password: pass });
        if (r.error) { note('auth-note', r.error.message); return; }
        user = r.data.user; updateNav(); openApply();
      } else {
        if (pass.length < 8) { note('auth-note', 'Password must be at least 8 characters.'); return; }
        var s = await sb.auth.signUp({ email: email, password: pass });
        if (s.error) { note('auth-note', s.error.message); return; }
        if (s.data && s.data.session) {
          user = s.data.user; updateNav(); openApply();
        } else {
          note('auth-note', 'Account created. Check your email to confirm it, then log in.', true);
        }
      }
    } catch (e) {
      note('auth-note', 'Network problem. Please try again.');
    } finally {
      btn.disabled = false;
    }
  }

  async function doForgot() {
    var email = $('a-email').value.trim();
    if (!email) { note('auth-note', 'Type your email above first, then press Forgot password.'); return; }
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (r.error) note('auth-note', r.error.message);
    else note('auth-note', 'If that email has an account, a reset link has been sent.', true);
  }

  async function doNewPass() {
    var p = $('np-pass').value;
    if (p.length < 8) { note('np-note', 'Password must be at least 8 characters.'); return; }
    var r = await sb.auth.updateUser({ password: p });
    if (r.error) { note('np-note', r.error.message); return; }
    note('np-note', 'Password changed.', true);
    setTimeout(function () { openApply(); }, 800);
  }

  async function doLogout() {
    await sb.auth.signOut();
    user = null; app = null; docs = [];
    updateNav();
    show('home');
  }

  // ---------- application ----------
  async function openApply() {
    show('apply');
    var box = $('apply-box');
    box.textContent = '';
    box.appendChild(h('div', { class: 'card', text: 'Loading...' }));
    try {
      var r = await sb.from('applications').select('*').eq('user_id', user.id).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) {
        var ins = await sb.from('applications').insert({ declared: false }).select().single();
        if (ins.error) {
          // maybe created in another tab at the same moment
          var again = await sb.from('applications').select('*').eq('user_id', user.id).maybeSingle();
          if (again.error || !again.data) throw ins.error;
          r = again;
        } else {
          r = ins;
        }
      }
      app = r.data;
      var d = await sb.from('application_documents').select('*').eq('user_id', user.id);
      if (d.error) throw d.error;
      docs = d.data || [];
      if (isEditable()) renderForm(); else renderStatus();
    } catch (e) {
      box.textContent = '';
      box.appendChild(h('div', { class: 'card' }, [
        h('div', { class: 'note bad', text: 'Could not load your application: ' + (e.message || 'unknown error') }),
        h('button', { type: 'button', class: 'btn', text: 'Try again', onclick: openApply })
      ]));
    }
  }

  function renderForm() {
    var box = $('apply-box');
    box.textContent = '';
    var card = h('div', { class: 'card' });
    box.appendChild(card);

    card.appendChild(h('h2', { text: 'Your application' }));
    card.appendChild(h('p', { class: 'muted', text: 'Signed in as ' + (user.email || '') + '. Fields marked * are required. Save your draft any time and come back later.' }));

    if (app.status === 'info_required') {
      card.appendChild(h('div', { class: 'note bad', text: 'The reviewers need more information: ' + (app.decision_note || 'please check your details and documents.') + ' Update your application below and submit again.' }));
    }

    FIELDS.forEach(function (f) {
      if (f.g) { card.appendChild(h('h3', { text: f.g })); return; }
      var lab = h('label', { 'for': 'f_' + f.k });
      lab.appendChild(document.createTextNode(f.l + ' '));
      if (f.req) lab.appendChild(h('span', { class: 'req', text: '*' }));
      card.appendChild(lab);
      var ctl;
      if (f.t === 'select') {
        ctl = h('select', { id: 'f_' + f.k });
        ctl.appendChild(h('option', { value: '', text: 'Select...' }));
        f.o.forEach(function (o) { ctl.appendChild(h('option', { value: o, text: o })); });
      } else if (f.t === 'textarea') {
        ctl = h('textarea', { id: 'f_' + f.k, maxlength: '1000' });
      } else {
        ctl = h('input', { id: 'f_' + f.k, type: f.t });
      }
      ctl.value = app[f.k] == null ? '' : app[f.k];
      card.appendChild(ctl);
    });

    card.appendChild(h('h3', { text: 'Documents' }));
    card.appendChild(h('p', { class: 'muted', text: 'JPG, PNG or PDF. Maximum 2 MB each (photos are shrunk for you).' }));
    (C.documents || []).forEach(function (def) { card.appendChild(docRow(def)); });

    card.appendChild(h('h3', { text: 'Declaration' }));
    var decl = h('label', { 'for': 'f_declared', style: 'font-weight:400' });
    var cb = h('input', { id: 'f_declared', type: 'checkbox' });
    cb.checked = !!app.declared;
    decl.appendChild(cb);
    decl.appendChild(document.createTextNode(C.declaration || 'I confirm the information is true.'));
    card.appendChild(decl);

    card.appendChild(h('div', { id: 'form-note', class: 'note hidden' }));
    card.appendChild(h('button', { type: 'button', class: 'btn alt', id: 'save-btn', text: 'Save draft', onclick: function () { saveDraft(true); } }));
    card.appendChild(h('button', { type: 'button', class: 'btn', id: 'submit-btn', text: 'Submit application', onclick: submitApp }));
  }

  function docRow(def) {
    var existing = null;
    for (var i = 0; i < docs.length; i++) if (docs[i].doc_type === def.key) existing = docs[i];
    var row = h('div', { class: 'docrow' });
    row.appendChild(h('div', { class: 'dname', text: def.label + (def.required ? ' *' : ' (optional)') }));
    var st = h('div', { class: 'dstat' + (existing ? ' ok' : ''), id: 'ds_' + def.key, text: existing ? 'Uploaded: ' + existing.file_name : 'Not uploaded yet' });
    row.appendChild(st);
    var inp = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf' });
    inp.addEventListener('change', function () {
      if (inp.files && inp.files[0]) uploadDoc(def, inp.files[0]);
      inp.value = '';
    });
    row.appendChild(inp);
    return row;
  }

  function setDocStatus(key, text, cls) {
    var e = $('ds_' + key);
    if (!e) return;
    e.textContent = text;
    e.className = 'dstat' + (cls ? ' ' + cls : '');
  }

  // shrink big phone photos so they fit the 2 MB limit
  function shrink(file) {
    return new Promise(function (resolve) {
      if (file.type === 'application/pdf' || file.size <= 1500000) { resolve(file); return; }
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); resolve(b || file); }, 'image/jpeg', 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function uploadDoc(def, file) {
    var okTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    var extOf = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
    if (okTypes.indexOf(file.type) < 0) { setDocStatus(def.key, 'Only JPG, PNG or PDF files are allowed.', 'bad'); return; }
    setDocStatus(def.key, 'Uploading...', '');
    try {
      var blob = await shrink(file);
      var type = blob.type || file.type;
      if (okTypes.indexOf(type) < 0) type = file.type;
      if (blob.size > 2 * 1024 * 1024) { setDocStatus(def.key, 'This file is bigger than 2 MB. Please choose a smaller one.', 'bad'); return; }

      var path = user.id + '/' + uuid() + '.' + extOf[type];
      var up = await sb.storage.from('documents').upload(path, blob, { contentType: type });
      if (up.error) throw up.error;

      var old = null;
      for (var i = 0; i < docs.length; i++) if (docs[i].doc_type === def.key) old = docs[i];
      if (old) {
        await sb.from('application_documents').delete().eq('id', old.id);
        await sb.storage.from('documents').remove([old.file_path]);
      }

      var ins = await sb.from('application_documents')
        .insert({ doc_type: def.key, file_path: path, file_name: String(file.name || 'file').slice(0, 120), file_size: blob.size })
        .select().single();
      if (ins.error) {
        await sb.storage.from('documents').remove([path]);
        throw ins.error;
      }
      docs = docs.filter(function (d) { return d.doc_type !== def.key; });
      docs.push(ins.data);
      setDocStatus(def.key, 'Uploaded: ' + ins.data.file_name, 'ok');
    } catch (e) {
      setDocStatus(def.key, 'Upload failed: ' + (e.message || 'please try again'), 'bad');
    }
  }

  function collect() {
    var o = {};
    FIELDS.forEach(function (f) {
      if (!f.k) return;
      var v = $('f_' + f.k).value.trim();
      o[f.k] = v === '' ? null : v;
    });
    o.declared = $('f_declared').checked;
    return o;
  }

  async function saveDraft(showMsg) {
    var vals = collect();
    var r = await sb.from('applications').update(vals).eq('id', app.id).select().single();
    if (r.error) { note('form-note', 'Could not save: ' + r.error.message); return false; }
    app = r.data;
    if (showMsg) note('form-note', 'Draft saved.', true);
    return true;
  }

  async function submitApp() {
    note('form-note', '');
    var sbtn = $('submit-btn'), vbtn = $('save-btn');
    sbtn.disabled = true; vbtn.disabled = true;
    try {
      if (!(await saveDraft(false))) return;

      var missing = [];
      FIELDS.forEach(function (f) {
        if (f.req && !app[f.k]) missing.push(f.l.replace(/\s*\(.*\)\s*$/, ''));
      });
      (C.documents || []).forEach(function (d) {
        if (d.required && !docs.some(function (x) { return x.doc_type === d.key; })) missing.push(d.label + ' (document)');
      });
      if (missing.length) { note('form-note', 'Please complete: ' + missing.join(', ') + '.'); return; }
      if (!app.declared) { note('form-note', 'Please tick the declaration box.'); return; }

      var r = await sb.rpc('submit_application');
      if (r.error) { note('form-note', r.error.message); return; }

      var fresh = await sb.from('applications').select('*').eq('id', app.id).single();
      if (fresh.data) app = fresh.data; else app.ref_no = r.data;
      renderStatus();
    } catch (e) {
      note('form-note', 'Network problem. Please try again.');
    } finally {
      if ($('submit-btn')) { $('submit-btn').disabled = false; $('save-btn').disabled = false; }
    }
  }

  function renderStatus() {
    var box = $('apply-box');
    box.textContent = '';
    var card = h('div', { class: 'card' });
    box.appendChild(card);
    card.appendChild(h('h2', { text: 'My application' }));

    if (app.ref_no) {
      card.appendChild(h('div', { class: 'refbox' }, [
        h('div', { class: 'muted', text: 'Your reference number' }),
        h('div', { class: 'refno', text: app.ref_no })
      ]));
      card.appendChild(h('p', { class: 'muted', text: 'Keep this number. Take a screenshot or use the button below.' }));
    }

    card.appendChild(h('p', {}, [
      document.createTextNode('Status: '),
      h('span', { class: 'badge ' + app.status, text: STATUS_LABEL[app.status] || app.status })
    ]));
    if (app.submitted_at) card.appendChild(h('p', { class: 'muted', text: 'Submitted: ' + fmtDate(app.submitted_at) }));
    if (app.decision_note) card.appendChild(h('div', { class: 'note ok', text: 'Message from the reviewers: ' + app.decision_note }));

    card.appendChild(h('h3', { text: 'Summary' }));
    var kv = h('div', { class: 'kv' });
    [['Name', 'full_name'], ['Email', 'email'], ['Phone', 'phone'], ['Institution', 'institution'], ['Course', 'course'], ['Level', 'level'], ['Matric no.', 'matric_no']].forEach(function (p) {
      kv.appendChild(h('div', { class: 'k', text: p[0] }));
      kv.appendChild(h('div', { class: 'v', text: app[p[1]] || '-' }));
    });
    card.appendChild(kv);

    card.appendChild(h('h3', { text: 'Uploaded documents' }));
    var ul = h('ul', { class: 'plain' });
    docs.forEach(function (d) {
      var label = d.doc_type;
      (C.documents || []).forEach(function (x) { if (x.key === d.doc_type) label = x.label; });
      ul.appendChild(h('li', { text: label + ' - ' + d.file_name }));
    });
    card.appendChild(ul);

    card.appendChild(h('button', { type: 'button', class: 'btn alt noprint', text: 'Print / save as PDF', onclick: function () { window.print(); } }));
    card.appendChild(h('button', { type: 'button', class: 'btn alt noprint', text: 'Refresh status', onclick: openApply }));
  }

  // ---------- start ----------
  function bind() {
    var goBtns = document.querySelectorAll('[data-go]');
    for (var i = 0; i < goBtns.length; i++) {
      (function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-go')); }); })(goBtns[i]);
    }
    $('nav-logout').addEventListener('click', doLogout);
    $('tab-login').addEventListener('click', function () { setMode('login'); note('auth-note', ''); });
    $('tab-signup').addEventListener('click', function () { setMode('signup'); note('auth-note', ''); });
    $('auth-go').addEventListener('click', doAuth);
    $('forgot').addEventListener('click', doForgot);
    $('np-go').addEventListener('click', doNewPass);
    $('a-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doAuth(); });
  }

  async function init() {
    buildHome();
    bind();
    if (!C.SUPABASE_URL || /PASTE/.test(C.SUPABASE_URL) || !C.SUPABASE_ANON_KEY || /PASTE/.test(C.SUPABASE_ANON_KEY) || !window.supabase) {
      show('setup');
      return;
    }
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    setMode('login');

    sb.auth.onAuthStateChange(function (event, session) {
      user = session ? session.user : null;
      updateNav();
      if (event === 'PASSWORD_RECOVERY') show('newpass');
    });

    try {
      var s = await sb.auth.getSession();
      user = s.data && s.data.session ? s.data.session.user : null;
    } catch (e) { user = null; }
    updateNav();
    loadDeadline();
  }

  init();
})();
