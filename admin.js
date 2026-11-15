(function () {
  'use strict';

  var C = window.PORTAL || {};
  var $ = function (id) { return document.getElementById(id); };
  var PAGE = 20;

  var STATUS_LABEL = {
    draft: 'Draft',
    submitted: 'Submitted',
    under_review: 'Under review',
    info_required: 'More info needed',
    approved: 'Approved',
    rejected: 'Rejected',
    waitlisted: 'Waitlisted'
  };
  var COUNT_STATUSES = ['submitted', 'under_review', 'info_required', 'approved', 'waitlisted', 'rejected'];

  var DETAIL_FIELDS = [
    ['Reference', 'ref_no'], ['Email', 'email'], ['Phone', 'phone'],
    ['Date of birth', 'date_of_birth'], ['Gender', 'gender'],
    ['State', 'state'], ['LGA', 'lga'], ['Address', 'address'],
    ['Institution', 'institution'], ['Course', 'course'], ['Department', 'department'],
    ['Level', 'level'], ['Matric no.', 'matric_no'], ['Session', 'academic_session'],
    ['CGPA / result', 'cgpa'], ['Statement', 'reason'], ['Submitted', 'submitted_at'],
    ['Last note sent', 'decision_note']
  ];

  var sb = null, page = 0, total = 0;

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

  function fmtDate(d) {
    try { return new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return String(d); }
  }

  function docLabel(key) {
    var out = key;
    (C.documents || []).forEach(function (d) { if (d.key === key) out = d.label; });
    return out;
  }

  // ---------- login ----------
  async function isAdmin(uid) {
    var r = await sb.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
    return !!(r.data && r.data.user_id);
  }

  async function doLogin() {
    var email = $('l-email').value.trim(), pass = $('l-pass').value;
    note('login-note', '');
    if (!email || !pass) { note('login-note', 'Enter your email and password.'); return; }
    var btn = $('l-go'); btn.disabled = true;
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) { note('login-note', r.error.message); return; }
      if (!(await isAdmin(r.data.user.id))) {
        await sb.auth.signOut();
        note('login-note', 'This account is not an administrator.');
        return;
      }
      enter();
    } catch (e) {
      note('login-note', 'Network problem. Please try again.');
    } finally {
      btn.disabled = false;
    }
  }

  function enter() {
    $('nav-list').classList.remove('hidden');
    $('nav-out').classList.remove('hidden');
    page = 0;
    show('list');
    loadCounts();
    loadList();
  }

  async function logout() {
    await sb.auth.signOut();
    $('nav-list').classList.add('hidden');
    $('nav-out').classList.add('hidden');
    show('login');
  }

  // ---------- overview ----------
  async function loadCounts() {
    var box = $('counts');
    box.textContent = '';
    var res = await Promise.all(COUNT_STATUSES.map(function (s) {
      return sb.from('applications').select('id', { count: 'exact', head: true }).eq('status', s);
    }));
    var drafts = await sb.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'draft');
    COUNT_STATUSES.forEach(function (s, i) {
      box.appendChild(h('div', { class: 'chip' }, [h('b', { text: String(res[i].count || 0) }), document.createTextNode(STATUS_LABEL[s])]));
    });
    box.appendChild(h('div', { class: 'chip' }, [h('b', { text: String(drafts.count || 0) }), document.createTextNode('Drafts')]));
  }

  function buildQuery(sel, withCount) {
    var filter = $('f-status').value;
    var q = $('f-q').value.trim().replace(/[,()%*\\]/g, '');
    var qry = withCount ? sb.from('applications').select(sel, { count: 'exact' }) : sb.from('applications').select(sel);
    if (filter === 'nonDraft') qry = qry.neq('status', 'draft');
    else qry = qry.eq('status', filter);
    if (q) qry = qry.or('full_name.ilike.%' + q + '%,ref_no.ilike.%' + q + '%,matric_no.ilike.%' + q + '%');
    return qry;
  }

  async function loadList() {
    var list = $('list');
    list.textContent = '';
    note('list-note', '');
    var r = await buildQuery('id,ref_no,status,full_name,institution,level,submitted_at,created_at', true)
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (r.error) { note('list-note', 'Could not load: ' + r.error.message); return; }
    total = r.count || 0;
    if (!r.data.length) list.appendChild(h('div', { class: 'card muted', text: 'No applications found.' }));
    r.data.forEach(function (a) {
      var btn = h('button', { type: 'button', class: 'approw', onclick: function () { openDetail(a.id); } }, [
        h('div', { class: 'nm', text: a.full_name || '(no name yet)' }),
        h('div', { class: 'muted', text: (a.ref_no || 'no reference') + ' - ' + (a.institution || '-') + (a.level ? ', ' + a.level : '') }),
        h('span', { class: 'badge ' + a.status, text: STATUS_LABEL[a.status] || a.status })
      ]);
      list.appendChild(btn);
    });

    var pager = $('pager');
    pager.textContent = '';
    var pages = Math.max(1, Math.ceil(total / PAGE));
    pager.appendChild(h('button', { type: 'button', class: 'btn small alt', text: 'Previous', onclick: function () { if (page > 0) { page--; loadList(); } } }));
    pager.appendChild(h('div', { class: 'muted', text: 'Page ' + (page + 1) + ' of ' + pages + ' (' + total + ' total)' }));
    pager.appendChild(h('button', { type: 'button', class: 'btn small alt', text: 'Next', onclick: function () { if (page + 1 < pages) { page++; loadList(); } } }));
  }

  // ---------- one application ----------
  async function openDetail(id) {
    show('detail');
    var box = $('detail');
    box.textContent = '';
    box.appendChild(h('div', { class: 'card', text: 'Loading...' }));

    var r = await sb.from('applications').select('*').eq('id', id).single();
    if (r.error) {
      box.textContent = '';
      box.appendChild(h('div', { class: 'card' }, [h('div', { class: 'note bad', text: r.error.message })]));
      return;
    }
    var a = r.data;
    var d = await sb.from('application_documents').select('*').eq('user_id', a.user_id);
    var files = d.data || [];
    var links = await Promise.all(files.map(function (f) {
      return sb.storage.from('documents').createSignedUrl(f.file_path, 600);
    }));

    box.textContent = '';
    var card = h('div', { class: 'card' });
    box.appendChild(card);
    card.appendChild(h('button', { type: 'button', class: 'linkbtn', text: '< Back to list', onclick: function () { show('list'); loadList(); } }));
    card.appendChild(h('h2', { text: a.full_name || '(no name)' }));
    card.appendChild(h('p', {}, [h('span', { class: 'badge ' + a.status, text: STATUS_LABEL[a.status] || a.status })]));

    var kv = h('div', { class: 'kv' });
    DETAIL_FIELDS.forEach(function (p) {
      var v = a[p[1]];
      if (p[1] === 'submitted_at' && v) v = fmtDate(v);
      kv.appendChild(h('div', { class: 'k', text: p[0] }));
      kv.appendChild(h('div', { class: 'v', text: v == null || v === '' ? '-' : String(v) }));
    });
    card.appendChild(kv);

    card.appendChild(h('h3', { text: 'Documents (links work for 10 minutes)' }));
    if (!files.length) card.appendChild(h('p', { class: 'muted', text: 'No documents uploaded.' }));
    files.forEach(function (f, i) {
      var url = links[i] && links[i].data ? links[i].data.signedUrl : null;
      var row = h('div', { class: 'docrow' }, [h('div', { class: 'dname', text: docLabel(f.doc_type) }), h('div', { class: 'dstat', text: f.file_name })]);
      if (url) row.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'btn small alt', text: 'Open file' }));
      else row.appendChild(h('div', { class: 'dstat bad', text: 'Could not create a link.' }));
      card.appendChild(row);
    });

    card.appendChild(h('h3', { text: 'Decision' }));
    if (!a.ref_no) {
      card.appendChild(h('p', { class: 'muted', text: 'This applicant has not submitted yet, so no decision can be recorded.' }));
      return;
    }
    card.appendChild(h('label', { 'for': 'd-note', text: 'Message to the applicant (shown on their page). Required for "Ask for more info".' }));
    var ta = h('textarea', { id: 'd-note', maxlength: '500' });
    ta.value = a.decision_note || '';
    card.appendChild(ta);
    card.appendChild(h('div', { id: 'd-msg', class: 'note hidden' }));

    [['under_review', 'Mark under review', 'alt'], ['info_required', 'Ask for more info', 'alt'], ['approved', 'Approve', ''], ['waitlisted', 'Waitlist', 'alt'], ['rejected', 'Reject', 'danger']].forEach(function (b) {
      card.appendChild(h('button', { type: 'button', class: 'btn small ' + b[2], text: b[1], onclick: function () { decide(a.id, b[0], b[1]); } }));
    });
  }

  async function decide(id, status, label) {
    var noteText = $('d-note').value.trim();
    if (status === 'info_required' && !noteText) { note('d-msg', 'Write what information is needed first.'); return; }
    if (!window.confirm(label + '? The applicant will see the new status.')) return;
    var r = await sb.rpc('admin_set_decision', { p_id: id, p_status: status, p_note: noteText || null });
    if (r.error) { note('d-msg', r.error.message); return; }
    note('d-msg', 'Saved.', true);
    setTimeout(function () { openDetail(id); }, 600);
  }

  // ---------- CSV ----------
  function csvCell(v) {
    if (v == null) v = '';
    v = String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // stops spreadsheet formulas
    return '"' + v.replace(/"/g, '""') + '"';
  }

  async function exportCsv() {
    note('list-note', 'Preparing file...', true);
    var cols = ['ref_no', 'status', 'full_name', 'email', 'phone', 'gender', 'state', 'lga', 'institution', 'course', 'department', 'level', 'matric_no', 'academic_session', 'cgpa', 'submitted_at'];
    var rows = [cols.join(',')];
    var from = 0, step = 1000;
    for (;;) {
      var r = await buildQuery(cols.join(','), false)
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .range(from, from + step - 1);
      if (r.error) { note('list-note', 'Export failed: ' + r.error.message); return; }
      r.data.forEach(function (a) { rows.push(cols.map(function (c) { return csvCell(a[c]); }).join(',')); });
      if (r.data.length < step) break;
      from += step;
    }
    var blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'applications-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    note('list-note', 'Downloaded ' + (rows.length - 1) + ' rows.', true);
  }

  // ---------- start ----------
  async function init() {
    $('org').textContent = C.organisation || '';
    if (C.TEST_MODE) $('testbar').classList.remove('hidden');
    if (!C.SUPABASE_URL || /PASTE/.test(C.SUPABASE_URL) || !C.SUPABASE_ANON_KEY || /PASTE/.test(C.SUPABASE_ANON_KEY) || !window.supabase) {
      show('setup');
      return;
    }
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

    $('l-go').addEventListener('click', doLogin);
    $('l-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('nav-out').addEventListener('click', logout);
    $('nav-list').addEventListener('click', function () { show('list'); loadList(); });
    $('f-go').addEventListener('click', function () { page = 0; loadList(); });
    $('f-status').addEventListener('change', function () { page = 0; loadList(); });
    $('f-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { page = 0; loadList(); } });
    $('f-csv').addEventListener('click', exportCsv);

    try {
      var s = await sb.auth.getSession();
      if (s.data && s.data.session && (await isAdmin(s.data.session.user.id))) enter();
    } catch (e) { /* stay on login */ }
  }

  init();
})();
