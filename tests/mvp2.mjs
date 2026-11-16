import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ids = ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004'];
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create table profiles(id uuid primary key, verification_status text default 'pending', background_checked boolean default false);
    create function is_admin() returns boolean language sql as $$ select auth.uid()='${ids[3]}'::uuid $$;
    create function is_blocked_between(a uuid,b uuid) returns boolean language sql as $$ select current_setting('test.blocked',true)='yes' $$;
    create function can_contact(a uuid,b uuid) returns boolean language sql as $$ select a<>b and not coalesce(is_blocked_between(a,b),false) $$;
    insert into profiles(id) values ${ids.map(id => `('${id}')`).join(',')};
    create table requests(id uuid primary key,category text);
    create table offers(id uuid primary key,request_id uuid,helper_id uuid);
    create table exchanges(id uuid primary key,request_id uuid,helper_id uuid);
  `);
  for (const file of ['20261118500000_care_offer_guard.sql','20261119000000_mvp2_test_agreements.sql']) {
    await db.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url),'utf8'));
  }
  const user = async (n, role='authenticated') => { await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)",[n === null ? '' : ids[n]]); await db.exec(`set role ${role}`); };
  const owner = () => db.exec('reset role');
  const enable = async () => { await owner(); await db.exec('update mvp2_settings set enabled=true,simulation_enabled=true'); };
  const propose = async () => (await db.query("select * from propose_test_agreement($1,$1,'Arreglar una silla','2030-01-01T14:00:00Z',125050,'UYU')",[ids[1]])).rows[0];
  const act = async (id,action,text=null) => (await db.query('select * from act_test_agreement($1,$2,$3)',[id,action,text])).rows[0];
  return {db,user,owner,enable,propose,act};
}

test('server flag, immutable price, two independent confirmations, release and opt-in sharing', async () => {
  const {db,user,owner,enable,propose,act} = await fixture();
  try {
    await user(0); await assert.rejects(propose,/experiment_disabled/);
    await enable(); await user(0); const a = await propose();
    assert.equal(a.status,'proposed'); assert.equal(a.amount_minor,125050);
    await assert.rejects(act(a.id,'simulate_payment'),/invalid_state/);
    await act(a.id,'accept'); await act(a.id,'accept');
    await user(1); let b = await act(a.id,'accept'); assert.equal(b.accepted_by.length,2);
    await assert.rejects(act(a.id,'simulate_payment'),/invalid_state/);
    await user(0); b = await act(a.id,'simulate_payment'); assert.equal(b.payment_state,'simulated_held');
    b = await act(a.id,'finish'); assert.equal(b.status,'confirmed');
    b = await act(a.id,'finish'); assert.equal(b.finished_by.length,1);
    await user(2); assert.equal((await db.query('select * from test_agreements')).rows.length,0);
    await assert.rejects(act(a.id,'finish'),/not_allowed/);
    await assert.rejects(db.query('update test_agreements set amount_minor=1 where id=$1',[a.id]),/permission denied/);
    await user(1); b = await act(a.id,'finish'); assert.equal(b.status,'completed');
    assert.match(b.receipt,/SIMULATED-NO-MONEY/);
    await assert.rejects(act(a.id,'finish'),/invalid_state/);
    await assert.rejects(act(a.id,'review','fake'),/invalid_state/);
    await user(0); await act(a.id,'review','Quedó bárbara');
    await assert.rejects(act(a.id,'share'),/invalid_state/);
    await user(1); b = await act(a.id,'share'); assert.ok(b.share_token);
    const token=b.share_token;
    await user(null,'anon'); const shared = (await db.query('select shared_test_record($1) as record',[token])).rows[0].record;
    assert.equal(shared.review,'Quedó bárbara'); assert.equal(shared.simulation,true);
    assert.equal(shared.client_id,undefined); assert.equal(shared.versions,undefined);
    await user(1); await act(a.id,'revoke_share');
    await user(null,'anon'); assert.equal((await db.query('select shared_test_record($1) as record',[token])).rows[0].record,null);
    await owner(); await db.exec('update mvp2_settings set enabled=false');
    await user(0); assert.equal((await db.query('select * from test_agreements')).rows.length,0);
    await assert.rejects(act(a.id,'review','edit'),/experiment_disabled/);
  } finally { await db.close(); }
});

test('problems freeze release, two versions, bilateral redo and admin-only mediation',async () => {
  const {db,user,enable,propose,act} = await fixture();
  try {
    await enable(); await user(0); const a=await propose(); await act(a.id,'accept');
    await user(1); await act(a.id,'accept'); await user(0); await act(a.id,'simulate_payment');
    await act(a.id,'finish'); let b=await act(a.id,'report','No quedó bien'); assert.equal(b.finished_by.length,0);
    await assert.rejects(act(a.id,'finish'),/invalid_state/);
    await user(1); b=await act(a.id,'respond','Puedo rehacerlo'); assert.equal(Object.keys(b.versions).length,2);
    b=await act(a.id,'redo_done'); assert.equal(b.problem,'redo');
    await user(0); b=await act(a.id,'redo_done'); assert.equal(b.problem,'none');
    await assert.rejects(act(a.id,'respond','Should fail'),/invalid_state/);
    await act(a.id,'report','Falló de nuevo'); b=await act(a.id,'escalate'); assert.equal(b.problem,'mediation');
    const history=(await db.query("select body from test_agreement_events where agreement_id=$1 and action in ('report','respond') order by id",[a.id])).rows.map(e=>e.body);
    assert.deepEqual(history,['No quedó bien','Puedo rehacerlo','Falló de nuevo']);
    await assert.rejects(db.query('delete from test_agreement_events where agreement_id=$1',[a.id]),/permission denied/);
    await user(2); assert.equal((await db.query('select * from test_agreement_events')).rows.length,0);
    await user(0);
    await assert.rejects(act(a.id,'close_mediation'),/not_allowed/);
    await user(3); assert.equal((await db.query('select * from test_agreements')).rows.length,1);
    b=await act(a.id,'close_mediation'); assert.equal(b.payment_state,'simulated_held'); assert.equal(b.problem,'closed');
    await user(0); await assert.rejects(act(a.id,'finish'),/invalid_state/);
  } finally { await db.close(); }
});

test('invalid participants, currencies, amounts, past dates and blocked participants fail',async () => {
  const {db,user,enable,propose,act} = await fixture();
  try {
    await enable(); await user(0);
    const sql="select propose_test_agreement($1,$2,'Tarea',$3,$4,$5)";
    for (const args of [[ids[0],ids[0],'2030-01-01',100,'UYU'],[ids[1],ids[2],'2030-01-01',100,'UYU'],[ids[1],ids[1],'2000-01-01',100,'UYU'],[ids[1],ids[1],'2030-01-01',0,'UYU'],[ids[1],ids[1],'2030-01-01',100,'USD']]) {
      await assert.rejects(db.query(sql,args));
    }
    const a=await propose(); await db.exec("select set_config('test.blocked','yes',false)");
    await assert.rejects(act(a.id,'accept'),/blocked/); await assert.rejects(propose,/not_allowed/);
  } finally { await db.close(); }
});

test('unverified care helpers cannot offer or complete care work',async () => {
  const {db} = await fixture();
  try {
    await db.query("insert into requests values($1,'cuidado')",[ids[2]]);
    for (const table of ['offers','exchanges']) {
      await assert.rejects(db.query(`insert into ${table} values($1,$2,$3)`,[ids[0],ids[2],ids[1]]),/needs_verification/);
    }
    await db.query("update profiles set verification_status='verified' where id=$1",[ids[1]]);
    await assert.rejects(db.query('insert into offers values($1,$2,$3)',[ids[0],ids[2],ids[1]]),/needs_verification/);
    await db.query('update profiles set background_checked=true where id=$1',[ids[1]]);
    await db.query('insert into offers values($1,$2,$3)',[ids[0],ids[2],ids[1]]);
  } finally { await db.close(); }
});


test('exact cents and multipage PDF with valid cross references',async () => {
  const { moneyToMinor, mvp2Enabled } = await import('../src/lib/mvp2.ts');
  const { recordPdf } = await import('../src/lib/recordPdf.ts');
  assert.equal(mvp2Enabled,false);
  assert.equal(moneyToMinor('1250.50'),125050);
  assert.equal(moneyToMinor('0.01'),1);
  for (const invalid of ['0','-1','1.001','Infinity','1e3','1,50']) assert.throws(()=>moneyToMinor(invalid));
  const pdf = await recordPdf(['Che prueba (sin dinero)', ...Array(100).fill('Valoración: quedó bárbara')]).text();
  assert.match(pdf,/^%PDF-1.4/); assert.match(pdf,/\/Count 3/);
  const xref=Number(pdf.match(/startxref\n(\d+)/)[1]);
  assert.equal(pdf.slice(xref,xref+4),'xref');
  const offsets=[...pdf.matchAll(/(\d{10}) 00000 n/g)].map(m=>Number(m[1]));
  offsets.forEach((offset,i)=>assert.ok(pdf.slice(offset).startsWith(`${i+1} 0 obj`)));
});


test('care restrictions survive a later request-category change', async () => {
  const {db} = await fixture();
  try {
    await db.query("insert into requests values($1,'hogar')",[ids[2]]);
    await db.query('insert into offers values($1,$2,$3)',[ids[0],ids[2],ids[1]]);
    await assert.rejects(db.query("update requests set category='cuidado' where id=$1",[ids[2]]),/needs_verification/);
    assert.equal((await db.query('select category from requests where id=$1',[ids[2]])).rows[0].category,'hogar');
    await db.query("update profiles set verification_status='verified',background_checked=true where id=$1",[ids[1]]);
    await db.query("update requests set category='cuidado' where id=$1",[ids[2]]);
    await db.query("update requests set category='hogar' where id=$1",[ids[2]]);
    await db.query('delete from offers');
    await db.query('insert into exchanges values($1,$2,$3)',[ids[0],ids[2],ids[0]]);
    await assert.rejects(db.query("update requests set category='cuidado' where id=$1",[ids[2]]),/needs_verification/);
  } finally { await db.close(); }
});

test('legal translations cover both complete documents and retain connector disclaimer',async () => {
  const {legalEs,legalEn}=await import('../src/i18n/legal.ts');
  assert.equal(legalEn.terms.length,legalEs.terms.length);
  assert.equal(legalEn.privacy.length,legalEs.privacy.length);
  assert.match(legalEn.terms[0][1],/does not provide services, set prices, assign jobs or employ anyone/);
  assert.match(legalEn.privacy[3][1],/both accepted an introduction/);
  for (const copy of [legalEs,legalEn]) for (const section of [...copy.terms,...copy.privacy]) assert.ok(section.every(s=>s.trim().length>0));
});
