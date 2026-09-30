-- Vision Activ demonstration environment.
--
-- Loads a believable organisation that has been using the platform for about nine weeks: a CEO, three
-- managers and twelve employees, with baselines, weekly scorecards, commitments, progress notes, evidence,
-- verification, management reviews and notifications. Every person is fictional and uses an address on the
-- reserved ".example" domain, which can never receive mail.
--
-- How it respects the security model
--   * It is NOT a migration: demonstration data never reaches a clean replay or another environment.
--   * It writes as the database owner (like a migration would) and leaves every RLS policy, privilege and
--     constraint untouched. All validation triggers stay enabled except `commitments_before_write`, which
--     is disabled for the duration of this one transaction only, because it (correctly) refuses due dates in
--     the past and stamps "now" on completion; history cannot be created in real time. Its rules are applied
--     here explicitly and the table CHECK constraints (state consistency, verification consistency) still run.
--   * Audit triggers stay enabled, so the audit log truthfully records that this data was loaded today.
--   * It is idempotent: people are found by e-mail, everything else has a deterministic id or unique key and is
--     inserted with ON CONFLICT DO NOTHING. Running it again creates nothing new.
--   * Nothing is stored in this file that could be a credential. Supply the shared demonstration password at
--     run time:   psql ... -c "select set_config('demo.password', '<password>', false)" -f seed_demo.sql
--     (or call set_config in the same session). Without it the script refuses to create users.
--   * The existing administrator is not renamed, demoted or re-pointed. Its `performance_tracked` flag is set to
--     false (the flag exists for administrators) so it is not reported as a missed scorecard.
--
-- Go-live: run supabase/demo/deactivate_demo.sql to deactivate every demonstration account. History is kept.

-- ---------------------------------------------------------------------------------------------------------
-- Generators (session-local)
-- ---------------------------------------------------------------------------------------------------------
create or replace function pg_temp.demo_noise(p_key text) returns numeric
language sql immutable as $$
  select (((hashtextextended(p_key, 7) % 7) + 7) % 7 - 3) / 3.0 * 0.45
$$;

-- p_k: week index 0..7 (7 = current week). p_spec: {"m0":..,"m1":..,"adj":{dimension: number | [start,end]}}
create or replace function pg_temp.demo_score(p_person text, p_dim text, p_k numeric, p_spec jsonb, p_salt text)
returns int language plpgsql immutable as $$
declare
  v_mean numeric := (p_spec ->> 'm0')::numeric + ((p_spec ->> 'm1')::numeric - (p_spec ->> 'm0')::numeric) * p_k / 7.0;
  v_adj jsonb := p_spec -> 'adj' -> p_dim;
  v_a numeric := 0;
begin
  if v_adj is not null then
    if jsonb_typeof(v_adj) = 'array' then
      v_a := (v_adj ->> 0)::numeric + ((v_adj ->> 1)::numeric - (v_adj ->> 0)::numeric) * p_k / 7.0;
    else
      v_a := (v_adj #>> '{}')::numeric;
    end if;
  end if;
  return greatest(1, least(5, round(v_mean + v_a + pg_temp.demo_noise(p_person || p_dim || p_k::text || p_salt))))::int;
end $$;

create or replace function pg_temp.demo_metrics(p_dim text, s int, n int) returns jsonb
language plpgsql immutable as $$
declare
  v_var int;
  v_done int;
  v_plan numeric;
begin
  return case p_dim
    when 'accountability-ownership' then jsonb_build_object('Proactive actions', 2 * s + n, 'Reactive actions', greatest(0, 7 - s - n / 2))
    when 'innovation-improvement' then jsonb_build_object('Efficiency gain %', (s - 1) * 3 + n)
    when 'results-delivery' then jsonb_build_object('Deadlines met', 3 + 2 * s + n / 2, 'Deadlines missed', greatest(0, 5 - s - n / 2))
    when 'planning-prioritisation' then (
      select jsonb_build_object('Planned execution %', least(100, 58 + 8 * s + n), 'Actual execution %', greatest(0, least(100, 58 + 8 * s + n) - (6 - s) * 4 - n)))
    when 'oversight-governance' then (
      select jsonb_build_object('Variances detected', greatest(1, 7 - s), 'Corrective actions', least(greatest(1, 7 - s), round(greatest(1, 7 - s) * (0.3 + 0.14 * s))::int)))
    when 'focus-execution' then jsonb_build_object('Interruptions', greatest(2, 17 - 2 * s - n), 'Productive hours', 18 + 4 * s + n)
    when 'lessons-continuous-improvement' then jsonb_build_object('Lessons applied', greatest(0, s - 1 + n / 2))
    when 'decision-problem-solving' then jsonb_build_object('Issues resolved', 2 + s + n / 2, 'Issues escalated', greatest(0, 5 - s + n / 2))
    when 'collaboration-teamwork' then jsonb_build_object('Joint deliverables', greatest(0, s - 1 + n / 2))
    when 'communication-stakeholders' then jsonb_build_object('Stakeholder feedback score', greatest(1, least(5, round((s + (n - 1) * 0.2)::numeric, 1))))
    when 'client-engagement' then jsonb_build_object('Client satisfaction indicator', greatest(1, least(5, round((s + (1 - n) * 0.2)::numeric, 1))))
    when 'capability-skills' then (
      select jsonb_build_object('Training completed', greatest(0, s - 2 + n / 2), 'Training applied', greatest(0, s - 3 + n / 2)))
  end;
end $$;

create or replace function pg_temp.demo_evidence(p_dim text, s int, n int) returns text
language sql immutable as $$
  select (($j$
{
"accountability-ownership": [["Two actions I committed to slipped because I waited to be asked.","Several follow-ups were left to colleagues; I need to take ownership earlier."],["Took ownership of most of my open items and flagged two risks before they landed.","Followed through on agreed actions; one handover was picked up late."],["Owned the week's escalations end to end and closed every action I took in the team meeting.","Raised and resolved a client issue before it reached management."]],
"innovation-improvement": [["No improvement ideas put forward this week.","Stayed with the existing process; nothing new tried."],["Suggested one small change to the weekly reporting template.","Tested a shortcut in the approvals step; results still being measured."],["Automated a manual reporting step, saving about two hours a week.","Introduced a checklist that cut rework on handovers."]],
"results-delivery": [["Missed several deadlines this week, mainly on client documents.","Two deliverables went out late and needed rework."],["Most deliverables landed on time; one was delayed by a dependency.","Met the key client deadline; two internal items slipped a day."],["All deliverables met the agreed dates, one ahead of schedule.","Delivered every milestone on time with no rework."]],
"planning-prioritisation": [["Week was mostly reactive; planned work kept getting displaced.","Did not set priorities on Monday and it showed in the output."],["Planned the week on Monday but urgent requests displaced some items.","Priorities were clear for the main project; smaller tasks were reshuffled."],["Weekly plan set on Monday and followed; re-prioritised cleanly when an urgent request arrived.","Planned execution stayed on track with clear daily priorities."]],
"oversight-governance": [["Checks were skipped on two transactions; variances found late.","Did not complete the weekly control review."],["Completed the control checks; one variance needed a follow-up.","Reviewed the exception log and closed most corrective actions."],["Every control check completed and all variances resolved within the week.","Spotted a process variance early and corrected it before it reached the client."]],
"focus-execution": [["Constant interruptions meant planned work was done after hours.","Switched between tasks too often and finished little."],["Protected two focus blocks; other days were fragmented by requests.","Reasonable focus on the main task; some context switching."],["Kept focus blocks free of interruptions and finished the priority work early.","Good discipline: priority task completed before responding to secondary requests."]],
"lessons-continuous-improvement": [["Repeated a mistake from last month because the lesson was not applied.","Did not review what went wrong on the delayed delivery."],["Applied one lesson from last week's review to this week's handover.","Noted the lessons from the escalation and shared them with the team."],["Applied three lessons from previous cycles and updated the team playbook.","Ran a short retrospective and changed the process the same week."]],
"decision-problem-solving": [["Escalated issues that I could have resolved; decisions were slow.","Delayed a decision until it became urgent."],["Resolved most issues independently and escalated the two that needed approval.","Made reasonable decisions with the information available."],["Resolved the week's issues independently and escalated only what needed authority.","Diagnosed a recurring fault at root cause and fixed it."]],
"collaboration-teamwork": [["Worked mostly on my own; a joint deliverable was handed over late and incomplete.","Missed a team sync and a colleague had to redo part of the work."],["Supported colleagues on one joint deliverable; could share information sooner.","Generally cooperative; one handover lacked detail."],["Completed two joint deliverables and covered a colleague's leave with a clean handover.","Proactively helped another team unblock a shared deliverable."]],
"communication-stakeholders": [["Stakeholder updates were late and two queries went unanswered for days.","Client feedback was poor on the clarity of my updates."],["Kept stakeholders updated; feedback mixed on how clear the updates were.","Responded to most queries within a day."],["Stakeholder feedback was positive; updates were clear and on time.","Sent concise weekly updates and answered every query the same day."]],
"client-engagement": [["A client raised concerns about responsiveness this week.","Missed a scheduled client check-in."],["Client interactions were satisfactory; one follow-up was late.","Attended client calls prepared; action notes sent a day late."],["Client gave positive feedback on the quality of the session and follow-up.","Strengthened a key client relationship by resolving an issue quickly."]],
"capability-skills": [["No time spent on development this week.","Did not start the training I planned."],["Completed one training module and started applying it.","Attended a workshop; application still to be demonstrated."],["Completed the training module and applied it on a live client case.","Coached a colleague on a new tool after completing the course."]]
}
$j$::jsonb) -> p_dim -> (case when s <= 2 then 0 when s = 3 then 1 else 2 end) ->> (n % 2))::text
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Main load (one transaction: all or nothing)
-- ---------------------------------------------------------------------------------------------------------
do $demo$
declare
  v_org uuid;
  v_pw text := nullif(current_setting('demo.password', true), '');
  v_today date := private.org_today();
  v_w0 date := private.current_week_start();
  v_domain constant text := '@demo.visionactiv.example';
  v_people constant jsonb := $j$[
   {"k":"bob","n":"Bob Williams","e":"bob.williams","r":"ceo","m":null,"job":"Chief Executive Officer","j":-58,"m0":3.9,"m1":4.1,"adj":{"planning-prioritisation":-0.4,"communication-stakeholders":0.3},"st":-1,"skip":[]},
   {"k":"thandi","n":"Thandi Mokoena","e":"thandi.mokoena","r":"manager","m":"bob","job":"Operations Manager","j":-58,"m0":4.0,"m1":4.2,"adj":{"collaboration-teamwork":0.4,"oversight-governance":0.4,"planning-prioritisation":-0.3},"st":-1,"skip":[]},
   {"k":"daniel","n":"Daniel Naidoo","e":"daniel.naidoo","r":"manager","m":"bob","job":"Client & Commercial Manager","j":-58,"m0":3.8,"m1":3.9,"adj":{"client-engagement":0.7,"capability-skills":-0.5,"oversight-governance":-0.4},"st":-1,"skip":[]},
   {"k":"naledi","n":"Naledi Khumalo","e":"naledi.khumalo","r":"manager","m":"bob","job":"People & Performance Manager","j":-58,"m0":4.1,"m1":4.2,"adj":{"capability-skills":0.6,"communication-stakeholders":0.4,"results-delivery":[-0.6,0.1]},"st":-1,"skip":[]},
   {"k":"sipho","n":"Sipho Dlamini","e":"sipho.dlamini","r":"employee","m":"thandi","job":"Operations Coordinator","j":-58,"m0":4.3,"m1":4.6,"adj":{"innovation-improvement":[-0.9,0.2]},"st":-1,"skip":[]},
   {"k":"ayesha","n":"Ayesha Patel","e":"ayesha.patel","r":"employee","m":"thandi","job":"Project Coordinator","j":-58,"m0":3.9,"m1":4.0,"adj":{"results-delivery":0.9,"focus-execution":0.6,"planning-prioritisation":0.5,"collaboration-teamwork":-1.6,"communication-stakeholders":-1.3},"st":-1,"skip":[]},
   {"k":"kagiso","n":"Kagiso Mahlangu","e":"kagiso.mahlangu","r":"employee","m":"thandi","job":"Operations Analyst","j":-58,"m0":3.0,"m1":2.4,"adj":{"results-delivery":-0.8,"accountability-ownership":-0.9,"planning-prioritisation":-0.6,"focus-execution":-0.5,"collaboration-teamwork":0.3},"st":-1,"skip":[4,6,7]},
   {"k":"lerato","n":"Lerato Sithole","e":"lerato.sithole","r":"employee","m":"thandi","job":"Implementation Specialist","j":-16,"m0":3.2,"m1":3.3,"adj":{"capability-skills":-0.6,"collaboration-teamwork":0.4},"st":5,"skip":[]},
   {"k":"michelle","n":"Michelle van der Merwe","e":"michelle.vandermerwe","r":"employee","m":"daniel","job":"Account Executive","j":-58,"m0":4.5,"m1":4.6,"adj":{"client-engagement":0.4,"capability-skills":[-0.9,0.2]},"st":-1,"skip":[]},
   {"k":"themba","n":"Themba Zulu","e":"themba.zulu","r":"employee","m":"daniel","job":"Business Development Executive","j":-58,"m0":2.7,"m1":3.9,"adj":{"results-delivery":[-0.8,0.3],"planning-prioritisation":[-0.7,0.2]},"st":-1,"skip":[]},
   {"k":"fatima","n":"Fatima Cassim","e":"fatima.cassim","r":"employee","m":"daniel","job":"Client Success Executive","j":-58,"m0":3.5,"m1":3.6,"adj":{"client-engagement":0.5,"innovation-improvement":-0.5,"lessons-continuous-improvement":-0.4},"st":-1,"skip":[]},
   {"k":"jacques","n":"Jacques Botha","e":"jacques.botha","r":"employee","m":"daniel","job":"Customer Experience Specialist","j":-58,"m0":3.9,"m1":3.3,"adj":{"collaboration-teamwork":0.8,"communication-stakeholders":0.7,"client-engagement":0.5,"results-delivery":[-0.3,-1.0],"planning-prioritisation":[-0.4,-1.1]},"st":-1,"skip":[7]},
   {"k":"zanele","n":"Zanele Ngcobo","e":"zanele.ngcobo","r":"employee","m":"naledi","job":"People Operations Coordinator","j":-58,"m0":3.3,"m1":3.7,"adj":{"communication-stakeholders":0.4,"oversight-governance":-0.3},"st":-1,"skip":[]},
   {"k":"pieter","n":"Pieter Jacobs","e":"pieter.jacobs","r":"employee","m":"naledi","job":"Performance Analyst","j":-58,"m0":4.4,"m1":4.5,"adj":{"oversight-governance":0.4,"decision-problem-solving":0.4,"collaboration-teamwork":[-0.9,-0.1]},"st":-1,"skip":[]},
   {"k":"nomvula","n":"Nomvula Dube","e":"nomvula.dube","r":"employee","m":"naledi","job":"Finance & Administration Coordinator","j":-58,"m0":4.3,"m1":3.6,"adj":{"focus-execution":[0,-1.0],"decision-problem-solving":[0,-0.7],"accountability-ownership":0.3,"capability-skills":[-0.5,0.4]},"st":-1,"skip":[]},
   {"k":"reuben","n":"Reuben Adams","e":"reuben.adams","r":"employee","m":"naledi","job":"Business Support Specialist","j":-58,"m0":3.1,"m1":3.0,"adj":{"capability-skills":-0.8,"planning-prioritisation":-0.5,"communication-stakeholders":0.4},"st":-1,"skip":[5,7]}
  ]$j$::jsonb;

  v_commitments constant jsonb := $j$[
   {"c":"c01","p":"sipho","d":"innovation-improvement","t":"Introduce a weekly operational exception review","a":"Hold a 30-minute Friday review of delivery exceptions with the coordinators and log each root cause and owner.","tf":"8 weeks","ep":"Weekly exception log and count of repeat exceptions.","pr":"normal","ms":"Repeat exceptions per week","b":9,"tg":4,"cv":4,"st":"complete","cr":52,"du":-12,"co":16,"vs":"verified","vb":"thandi","vd":13,"vn":"Exception log is up to date and repeat exceptions have dropped from nine to four a week. Good result.","src":"b",
    "up":[[44,"note","o","First review held with the coordinators. We logged 9 exceptions, 6 of them repeats from the month before.",15],[30,"note","o","Agreed owners for each recurring exception. Repeat count down to 6 this week.",50],[18,"note","o","Repeat exceptions at 4 for the third week running. Preparing the evidence for verification.",90]],
    "ev":[{"kd":"note","t":"Exception log, weeks 1 to 7","b":"Exception log shows repeat exceptions falling from 9 to 4 per week over seven weeks. Owners are assigned for every recurring item.","rs":"accepted","rb":"thandi","cd":17,"rd":14,"rn":"Log reviewed, the figures check out."},{"kd":"metric","t":"Repeat exceptions per week","mv":4,"rs":"accepted","rb":"thandi","cd":17,"rd":14,"rn":""}]},
   {"c":"c02","p":"sipho","d":"capability-skills","t":"Complete the advanced logistics planning course","a":"Complete the six modules and apply the demand-planning method to next month's delivery schedule.","tf":"10 weeks","ep":"Course completion certificate and the revised delivery schedule.","pr":"normal","ms":"Modules completed","b":0,"tg":6,"cv":3,"st":"in_progress","cr":35,"du":18,"src":3,
    "up":[[21,"note","o","Modules 1 and 2 done. The demand-planning method is useful for the delivery schedule.",33],[6,"note","o","Module 3 completed. I will try the method on October's schedule once module 4 is done.",50]],"ev":[]},
   {"c":"c03","p":"ayesha","d":"collaboration-teamwork","t":"Improve cross-functional handover quality","a":"Introduce a one-page handover checklist between project coordination and implementation and review each handover with the receiving team.","tf":"6 weeks","ep":"Handover checklist and first-time acceptance rate from the implementation team.","pr":"high","ms":"Handovers accepted first time (%)","b":55,"tg":90,"cv":72,"st":"in_progress","cr":26,"du":21,"src":6,
    "up":[[19,"note","o","Drafted the checklist with Lerato and Kagiso's team. Used it for the first three handovers.",15],[8,"note","o","Acceptance rate is up to 72% from 55%. Two rejections were because client contact details were missing.",49],[5,"manager_note","m","Good progress. Please add client contact details as a mandatory line on the checklist and share it with Daniel's team as well.",null]],
    "ev":[{"kd":"note","t":"Handover checklist v2","b":"Checklist now covers scope, open risks, client contacts and agreed dates. Used on 11 handovers since 4 September.","rs":"pending","cd":6}]},
   {"c":"c04","p":"ayesha","d":"communication-stakeholders","t":"Send a weekly stakeholder status update every Friday","a":"Send a short written status update to the project sponsor and two key stakeholders by 15:00 every Friday.","tf":"8 weeks","ep":"Sent updates and any stakeholder replies.","pr":"normal","ms":"Weeks with an update sent on time","b":0,"tg":8,"cv":3,"st":"in_progress","cr":21,"du":35,"src":6,
    "up":[[14,"note","o","Sent updates for the first two Fridays. One went out at 17:00, so I missed the deadline.",25],[7,"note","o","Third update sent on time. The sponsor replied that the format is clear.",38]],"ev":[]},
   {"c":"c05","p":"kagiso","d":"results-delivery","t":"Reduce missed delivery deadlines","a":"Break each delivery into weekly milestones, confirm the dates with the coordinator on Monday and flag any risk by Wednesday.","tf":"6 weeks","ep":"Weekly milestone list and count of missed deadlines per fortnight.","pr":"high","ms":"Deadlines missed per fortnight","b":7,"tg":2,"cv":5,"st":"in_progress","cr":40,"du":-6,"src":2,
    "up":[[33,"note","o","Started the weekly milestone list. Still missing dates on the larger deliveries.",15],[20,"note","o","Two fewer missed deadlines than the previous fortnight. The client reporting pack is still late.",30],[9,"manager_note","m","We discussed the reporting pack. I have asked Ayesha to help you plan the next delivery. Please update the milestone list by Monday.",null],[4,"note","o","Milestone list updated. Two more deadlines slipped because of the system access issue.",40]],
    "ev":[{"kd":"note","t":"Milestone tracker","b":"Tracker covers the client reporting pack and two implementations. Three of the last eight milestones were missed.","rs":"pending","cd":4}]},
   {"c":"c06","p":"kagiso","d":"accountability-ownership","t":"Document recurring operational issues and corrective actions","a":"Keep a log of recurring operational issues with root cause, corrective action and owner, and review it with the manager every two weeks.","tf":"8 weeks","ep":"Issue log and a summary of corrective actions closed.","pr":"normal","ms":"Issues documented","b":0,"tg":20,"cv":4,"st":"blocked","bl":"Waiting for access to the incident log. IT ticket raised on 17 September and still open.","blk":9,"cr":30,"du":4,"src":"b",
    "up":[[22,"note","o","Set up the log template and documented the first four issues.",20],[9,"note","o","I cannot continue without access to the incident log. Raised an IT ticket and told Thandi.",20]],"ev":[]},
   {"c":"c07","p":"kagiso","d":"planning-prioritisation","t":"Plan the working week every Monday","a":"Spend 20 minutes each Monday listing the week's priorities and share the list with the manager.","tf":"4 weeks","ep":"Weekly priority lists.","pr":"normal","ms":"","st":"not_started","cr":6,"du":14,"src":5,"up":[],"ev":[]},
   {"c":"c08","p":"kagiso","d":"focus-execution","t":"Close outstanding implementation actions","a":"Close or re-plan the 18 open implementation actions from the onboarding projects, starting with the oldest.","tf":"5 weeks","ep":"Action register showing closed items and updated dates.","pr":"high","ms":"Open implementation actions","b":18,"tg":0,"cv":4,"st":"in_progress","pg":78,"cr":38,"du":7,"vs":"rejected","vb":"thandi","vd":6,"vn":"Only 14 of the 18 actions are closed in the register. Please close or re-plan the remaining four and resubmit with the updated register.","src":1,
    "up":[[16,"note","o","Closed the first ten actions. The rest depend on client confirmation.",55],[7,"note","o","Register updated and submitted as complete.",100],[3,"note","o","Working through the four remaining items.",78]],
    "ev":[{"kd":"note","t":"Action register extract","b":"Register extract as at 23 September: 14 actions closed, 4 open with new dates.","rs":"rejected","rb":"thandi","cd":7,"rd":6,"rn":"The extract shows four items still open."}]},
   {"c":"c09","p":"lerato","d":"capability-skills","t":"Complete product onboarding and certification","a":"Complete the six onboarding modules and pass the product certification assessment.","tf":"6 weeks","ep":"Module completion record and certification result.","pr":"normal","ms":"Modules completed","b":0,"tg":6,"cv":2,"st":"in_progress","cr":9,"du":25,"src":"b",
    "up":[[6,"note","o","Finished modules 1 and 2. Module 3 covers configuring client accounts, which I will do alongside Kagiso's team.",33]],"ev":[]},
   {"c":"c10","p":"lerato","d":"planning-prioritisation","t":"Agree 30/60/90-day objectives with my manager","a":"Draft objectives for the first 90 days, agree them with Thandi and record them in the team plan.","tf":"2 weeks","ep":"Agreed objectives document.","pr":"normal","ms":"","st":"complete","cr":12,"du":3,"co":4,"vs":"pending","src":"b",
    "up":[[10,"note","o","Drafted the first set of objectives. Waiting for Thandi's comments.",50],[4,"note","o","Objectives agreed with Thandi and filed in the team plan.",100]],
    "ev":[{"kd":"note","t":"Agreed 30/60/90-day objectives","b":"Objectives agreed on 26 September: complete onboarding, own two client implementations by day 60, lead a handover by day 90.","rs":"pending","cd":4}]},
   {"c":"c11","p":"michelle","d":"capability-skills","t":"Complete the executive negotiation programme","a":"Attend all four sessions and apply the framework to the two largest open proposals.","tf":"8 weeks","ep":"Attendance record and the outcome of the two proposals.","pr":"normal","ms":"Sessions attended","b":0,"tg":4,"cv":4,"st":"complete","cr":56,"du":-20,"co":24,"vs":"verified","vb":"daniel","vd":21,"vn":"Completed and applied on both proposals. One closed at a better margin than forecast.","src":"b",
    "up":[[40,"note","o","Session two done. Using the framework on the Khoza proposal.",50],[26,"note","o","All sessions attended. Both proposals negotiated using the framework.",100]],
    "ev":[{"kd":"note","t":"Programme attendance and outcomes","b":"Attended all four sessions. The Khoza renewal closed 2% above the forecast margin; the second proposal is at final review.","rs":"accepted","rb":"daniel","cd":25,"rd":22,"rn":"Confirmed with the proposal tracker."},{"kd":"link","t":"Certificate of completion","u":"https://learning.example.com/certificates/negotiation-programme","rs":"accepted","rb":"daniel","cd":25,"rd":22,"rn":""}]},
   {"c":"c12","p":"michelle","d":"innovation-improvement","t":"Improve proposal turnaround time","a":"Create reusable proposal templates for the three most common service packages and agree a two-day internal review slot.","tf":"8 weeks","ep":"Turnaround times from the proposal tracker.","pr":"high","ms":"Average proposal turnaround (days)","b":5.2,"tg":3.0,"cv":3.8,"st":"in_progress","cr":30,"du":12,"src":2,
    "up":[[23,"note","o","Templates drafted for two of the three service packages. Turnaround on the last three proposals averaged 4.6 days.",27],[10,"note","o","All three templates are live. Average turnaround is down to 3.8 days over the last five proposals.",64]],
    "ev":[{"kd":"metric","t":"Average turnaround (days)","mv":3.8,"rs":"pending","cd":10}]},
   {"c":"c13","p":"themba","d":"results-delivery","t":"Reduce missed proposal deadlines","a":"Agree submission dates with each prospect at kick-off and block the preparation time in the calendar.","tf":"8 weeks","ep":"Proposal tracker showing the submitted-on-time rate.","pr":"high","ms":"Proposals submitted late per month","b":6,"tg":1,"cv":1,"st":"complete","cr":50,"du":-10,"co":14,"vs":"verified","vb":"daniel","vd":10,"vn":"Only one late submission last month against six in August. The tracker confirms it.","src":"b",
    "up":[[40,"note","o","Blocking preparation time in the calendar is working. Two late proposals in the last fortnight instead of four.",60],[15,"note","o","One late submission last month. Sending the tracker to Daniel for verification.",100]],
    "ev":[{"kd":"note","t":"Proposal tracker, August to September","b":"Late submissions fell from six in August to one in September. Preparation time is blocked in the calendar for every open proposal.","rs":"accepted","rb":"daniel","cd":14,"rd":10,"rn":"Matches the tracker."},{"kd":"metric","t":"Proposals submitted late last month","mv":1,"rs":"accepted","rb":"daniel","cd":14,"rd":10,"rn":""}]},
   {"c":"c14","p":"themba","d":"planning-prioritisation","t":"Introduce a weekly pipeline planning session","a":"Run a 45-minute pipeline planning session every Monday and record the top five opportunities and next steps.","tf":"8 weeks","ep":"Session notes and opportunity next steps.","pr":"normal","ms":"Weeks with a planning session held","b":0,"tg":8,"cv":5,"st":"in_progress","cr":38,"du":16,"src":2,
    "up":[[22,"note","o","Four sessions held so far. The top-five list is helping me decide where to spend the week.",50],[8,"note","o","Session five held. Two opportunities moved to proposal stage.",63]],"ev":[]},
   {"c":"c15","p":"themba","d":"client-engagement","t":"Build a call-back routine for warm leads","a":"Call every warm lead within one working day of the enquiry and log the outcome in the CRM.","tf":"6 weeks","ep":"CRM call log.","pr":"normal","ms":"","st":"not_started","cr":5,"du":28,"src":7,"up":[],"ev":[]},
   {"c":"c16","p":"fatima","d":"innovation-improvement","t":"Pilot a client health-check template","a":"Design a one-page health-check and use it with twelve key accounts.","tf":"8 weeks","ep":"Completed health-checks and follow-up actions.","pr":"normal","ms":"Accounts checked","b":0,"tg":12,"cv":6,"st":"in_progress","cr":33,"du":20,"src":2,
    "up":[[20,"note","o","Template agreed with Daniel. First three accounts checked; two raised reporting concerns.",25],[6,"note","o","Six accounts done. Follow-up actions agreed with four of them.",50]],
    "ev":[{"kd":"note","t":"Health-check summary, six accounts","b":"Six accounts checked. Common themes: reporting clarity and onboarding support. Follow-up actions are logged in the CRM.","rs":"accepted","rb":"daniel","cd":6,"rd":4,"rn":"Useful themes."}]},
   {"c":"c17","p":"fatima","d":"lessons-continuous-improvement","t":"Hold a lessons-learned session after each quarterly client review","a":"Run a one-hour lessons-learned session with the account team after each quarterly client review.","tf":"4 weeks","ep":"Session notes and changes made.","pr":"normal","ms":"","st":"complete","cr":24,"du":2,"co":2,"vs":"pending","src":5,
    "up":[[10,"note","o","Session scheduled with the account team for next week.",60],[2,"note","o","Session held. Three changes agreed for the next review cycle.",100]],
    "ev":[{"kd":"note","t":"Lessons-learned session notes","b":"Three changes agreed: share the agenda earlier, name an owner per action, and follow up within five days.","rs":"pending","cd":2}]},
   {"c":"c18","p":"jacques","d":"planning-prioritisation","t":"Improve on-time completion of customer experience reviews","a":"Schedule review slots at the start of each week and protect them from ad-hoc requests.","tf":"6 weeks","ep":"Review completion log.","pr":"high","ms":"Reviews completed on time (%)","b":60,"tg":90,"cv":72,"st":"in_progress","pg":40,"cr":28,"du":-3,"src":4,
    "up":[[20,"note","o","Scheduling review slots on Monday. On-time rate up from 60% to 68%.",27],[8,"note","o","72% on time, but two reviews slipped again when urgent client calls came in.",40],[2,"manager_note","m","We need to protect these slots better. Let's agree a rule for urgent calls on Thursday.",null]],"ev":[]},
   {"c":"c19","p":"jacques","d":"results-delivery","t":"Reduce the backlog of open customer cases","a":"Clear cases older than 14 days first and agree a daily limit on new cases taken with the team lead.","tf":"6 weeks","ep":"Weekly open-case counts.","pr":"high","ms":"Open customer cases","b":46,"tg":20,"cv":33,"st":"in_progress","cr":19,"du":10,"src":5,
    "up":[[12,"note","o","Backlog down from 46 to 39 cases.",27],[3,"note","o","33 open cases. Fourteen of these are waiting on customers.",50]],
    "ev":[{"kd":"metric","t":"Open customer cases","mv":33,"rs":"pending","cd":3}]},
   {"c":"c20","p":"zanele","d":"lessons-continuous-improvement","t":"Document recurring onboarding issues and corrective actions","a":"Log recurring onboarding issues with root cause and corrective action, and share the log with hiring managers.","tf":"6 weeks","ep":"Issue log and corrective actions.","pr":"normal","ms":"Recurring issues with a corrective action","b":0,"tg":8,"cv":8,"st":"complete","cr":37,"du":6,"co":5,"vs":"pending","src":2,
    "up":[[25,"note","o","Five recurring issues documented so far; three already have corrective actions.",63],[5,"note","o","All eight issues documented with corrective actions and owners. Shared with the hiring managers.",100]],
    "ev":[{"kd":"note","t":"Onboarding issue log","b":"Eight recurring onboarding issues documented with root cause, corrective action and owner. Shared with hiring managers on 24 September.","rs":"pending","cd":5}]},
   {"c":"c21","p":"zanele","d":"planning-prioritisation","t":"Publish a monthly people-operations calendar","a":"Publish a shared calendar of onboarding, leave, reviews and payroll deadlines by the 25th of each month.","tf":"4 weeks","ep":"Published calendar and feedback from managers.","pr":"normal","ms":"Calendar items scheduled in advance","b":12,"tg":30,"cv":26,"st":"in_progress","cr":20,"du":8,"src":4,
    "up":[[9,"note","o","October calendar drafted with 26 items already scheduled. Sharing it with the managers for comment.",78]],"ev":[]},
   {"c":"c22","p":"pieter","d":"collaboration-teamwork","t":"Run a quarterly dashboard walkthrough with team leads","a":"Walk the team leads through the performance dashboard and agree what each lead will act on.","tf":"6 weeks","ep":"Attendance and agreed actions.","pr":"normal","ms":"","st":"complete","cr":45,"du":-10,"co":14,"vs":"verified","vb":"naledi","vd":11,"vn":"Walkthrough held with all three team leads and actions recorded.","src":"b",
    "up":[[20,"note","o","Walkthrough held with Thandi, Daniel and Naledi. Agreed three follow-up actions.",100]],
    "ev":[{"kd":"note","t":"Walkthrough notes and actions","b":"All three team leads attended. Agreed actions: weekly submission reminder, blocked-commitment review, and a shared definition of overdue.","rs":"accepted","rb":"naledi","cd":14,"rd":11,"rn":"Good record of the agreed actions."}]},
   {"c":"c23","p":"pieter","d":"innovation-improvement","t":"Automate the weekly performance pack","a":"Replace the manual spreadsheet steps in the weekly performance pack with a scheduled report.","tf":"8 weeks","ep":"Hours spent per week before and after.","pr":"high","ms":"Manual hours per week","b":6,"tg":1.5,"cv":2.5,"st":"in_progress","cr":34,"du":9,"src":3,
    "up":[[18,"note","o","Report scheduled for the first three sections. Manual time is down to 4 hours.",44],[5,"note","o","Five of the six sections are automated. 2.5 hours a week is still spent on commentary.",78]],
    "ev":[{"kd":"metric","t":"Manual hours per week","mv":2.5,"rs":"accepted","rb":"naledi","cd":5,"rd":4,"rn":"Checked against the timesheet."}]},
   {"c":"c24","p":"nomvula","d":"focus-execution","t":"Reduce interruptions during the month-end close","a":"Agree a close calendar with the approvers and route non-urgent queries to a daily slot.","tf":"6 weeks","ep":"Interruption log during the close.","pr":"critical","ms":"Interruptions per week","b":18,"tg":8,"cv":13,"st":"blocked","bl":"Dependency on Finance: waiting for sign-off on the revised close calendar.","blk":6,"cr":27,"du":6,"src":6,
    "up":[[20,"note","o","Interruption log started. 18 interruptions in the last close week.",0],[12,"note","o","Drafted the close calendar and agreed a daily query slot with two approvers. Down to 13 a week.",50],[6,"note","o","Finance have not signed off the calendar yet, so I cannot move the last approvers to the new slot.",50]],"ev":[]},
   {"c":"c25","p":"nomvula","d":"decision-problem-solving","t":"Create an escalation guide for supplier payment queries","a":"Write a one-page guide on which supplier payment queries I resolve and which go to Finance management.","tf":"4 weeks","ep":"Guide and number of queries escalated.","pr":"normal","ms":"Queries escalated unnecessarily per week","b":9,"tg":3,"cv":6,"st":"in_progress","cr":15,"du":13,"src":6,
    "up":[[7,"note","o","Guide drafted. Unnecessary escalations are down from 9 to 6 a week.",50]],"ev":[]},
   {"c":"c26","p":"nomvula","d":"capability-skills","t":"Complete the advanced spreadsheet and reporting course","a":"Complete the online course and rebuild the month-end reconciliation workbook.","tf":"8 weeks","ep":"Certificate and rebuilt workbook.","pr":"normal","ms":"Modules completed","b":0,"tg":5,"cv":5,"st":"complete","cr":55,"du":-15,"co":30,"vs":"verified","vb":"naledi","vd":27,"vn":"Workbook rebuilt and reconciliation time reduced. Certificate received.","src":"b",
    "up":[[45,"note","o","Modules 1 to 3 done.",60],[31,"note","o","Course complete and the reconciliation workbook has been rebuilt.",100]],
    "ev":[{"kd":"link","t":"Course certificate","u":"https://learning.example.com/certificates/spreadsheet-reporting","rs":"accepted","rb":"naledi","cd":30,"rd":27,"rn":""},{"kd":"note","t":"Rebuilt reconciliation workbook","b":"Month-end reconciliation now takes 50 minutes instead of 2 hours.","rs":"accepted","rb":"naledi","cd":30,"rd":27,"rn":"Confirmed on the October close."}]},
   {"c":"c27","p":"reuben","d":"planning-prioritisation","t":"Schedule and track weekly office-support requests","a":"Log every support request, agree a response time with each requester and review the log weekly.","tf":"6 weeks","ep":"Request log and response times.","pr":"high","ms":"Requests closed within 2 days (%)","b":50,"tg":85,"cv":61,"st":"in_progress","cr":34,"du":-9,"src":2,
    "up":[[26,"note","o","Started the request log. 55% closed within two days.",14],[14,"note","o","61% closed on time. Facilities requests are the slowest.",31],[5,"manager_note","m","This is now overdue. Let's talk on Friday about what is getting in the way and agree a realistic date.",null]],"ev":[]},
   {"c":"c28","p":"reuben","d":"communication-stakeholders","t":"Complete the stakeholder communication training","a":"Complete the two-day stakeholder communication workshop and brief the team on what I learned.","tf":"6 weeks","ep":"Attendance confirmation and team briefing notes.","pr":"normal","ms":"","st":"not_started","cr":10,"du":21,"src":4,"up":[],"ev":[]},
   {"c":"c29","p":"thandi","d":"oversight-governance","t":"Introduce a weekly operational exception review across the team","a":"Hold a weekly exception review with the four coordinators and track repeat exceptions.","tf":"8 weeks","ep":"Exception log and repeat-exception trend.","pr":"high","ms":"Repeat exceptions per week (team)","b":14,"tg":6,"cv":9,"st":"in_progress","cr":42,"du":14,"src":"b",
    "up":[[30,"note","o","Started the weekly review with the team. Fourteen repeat exceptions in the first week.",0],[14,"note","o","Down to eleven repeat exceptions. Sipho's log format is now used by the whole team.",38],[4,"note","o","Nine repeat exceptions this week. Kagiso's analysis is still the biggest gap.",63]],"ev":[]},
   {"c":"c30","p":"thandi","d":"capability-skills","t":"Coach two direct reports towards next-level roles","a":"Agree development plans with Sipho and Ayesha and review progress monthly.","tf":"12 weeks","ep":"Development plans and monthly review notes.","pr":"normal","ms":"Monthly coaching sessions held","b":0,"tg":3,"cv":1,"st":"in_progress","cr":25,"du":45,"src":5,
    "up":[[14,"note","o","Agreed a development plan with Sipho. Ayesha's session is booked for next week.",33]],"ev":[]},
   {"c":"c31","p":"thandi","d":"lessons-continuous-improvement","t":"Complete management development programme, module 2","a":"Complete module 2 and apply the delegation framework in the team.","tf":"4 weeks","ep":"Completion record and examples of delegation.","pr":"normal","ms":"Modules completed","b":1,"tg":2,"cv":2,"st":"complete","cr":24,"du":5,"co":2,"vs":"pending","src":6,
    "up":[[2,"note","o","Module 2 finished. Delegated the weekly reporting pack to Sipho using the framework.",100]],
    "ev":[{"kd":"note","t":"Module 2 completion and delegation example","b":"Module 2 completed on 28 September. Delegated the weekly reporting pack to Sipho with clear expectations and a review date.","rs":"pending","cd":2}]},
   {"c":"c32","p":"daniel","d":"client-engagement","t":"Reduce unresolved client escalations","a":"Review every open escalation weekly with the account team and agree an owner and date for each.","tf":"8 weeks","ep":"Escalation register.","pr":"critical","ms":"Open client escalations","b":14,"tg":4,"cv":9,"st":"in_progress","cr":40,"du":14,"src":"b",
    "up":[[28,"note","o","Register set up. Fourteen escalations open, six older than 30 days.",0],[14,"note","o","Twelve open. Two closed after calls with the clients.",20],[3,"note","o","Nine open. The three oldest are waiting on the delivery team.",50]],"ev":[]},
   {"c":"c33","p":"daniel","d":"planning-prioritisation","t":"Improve quarterly pipeline forecast accuracy","a":"Review forecast assumptions with each account executive every fortnight and record variances.","tf":"12 weeks","ep":"Forecast against actual variances.","pr":"normal","ms":"Forecast variance (%)","b":22,"tg":10,"cv":17,"st":"in_progress","cr":28,"du":40,"src":4,
    "up":[[12,"note","o","First fortnightly review done. Variance on the last quarter was 17%.",42]],"ev":[]},
   {"c":"c34","p":"naledi","d":"lessons-continuous-improvement","t":"Close the loop on performance review actions within 7 days","a":"Record every review action in Vision Activ and follow up within seven days.","tf":"8 weeks","ep":"Review actions closed on time.","pr":"normal","ms":"Review actions closed within 7 days (%)","b":55,"tg":90,"cv":74,"st":"in_progress","cr":36,"du":15,"src":3,
    "up":[[15,"note","o","74% of review actions were closed within a week, up from 55%.",54]],"ev":[]},
   {"c":"c35","p":"naledi","d":"results-delivery","t":"Reduce missed performance check-ins","a":"Send reminders on Thursday and follow up personally with anyone who has not submitted by Friday.","tf":"6 weeks","ep":"Weekly submission rates.","pr":"normal","ms":"Team members missing a check-in per week","b":4,"tg":1,"cv":1,"st":"complete","cr":48,"du":-8,"co":12,"vs":"verified","vb":"bob","vd":9,"vn":"Submission rate in the team is consistently above 90%.","src":"b",
    "up":[[30,"note","o","Reminders and personal follow-ups are working. Missed check-ins are down to one a week.",77],[13,"note","o","Holding at one missed check-in a week for three weeks.",100]],
    "ev":[{"kd":"metric","t":"Missed check-ins per week","mv":1,"rs":"accepted","rb":"bob","cd":12,"rd":9,"rn":""},{"kd":"note","t":"Submission trend","b":"Team submission rate above 90% for the last five weeks.","rs":"accepted","rb":"bob","cd":12,"rd":9,"rn":"Agrees with the cockpit."}]},
   {"c":"c36","p":"bob","d":"planning-prioritisation","t":"Run the monthly executive performance review","a":"Hold a monthly executive review of the organisation's performance, blockers and the people attention list.","tf":"12 weeks","ep":"Review dates and agreed decisions.","pr":"high","ms":"Monthly executive reviews held","b":0,"tg":3,"cv":1,"st":"in_progress","cr":35,"du":50,"src":"b",
    "up":[[6,"note","o","First executive review held. Agreed that blocked commitments are reviewed weekly.",33]],"ev":[]},
   {"c":"c37","p":"bob","d":"communication-stakeholders","t":"Hold quarterly one-to-ones with every manager","a":"Book and hold a quarterly one-to-one with each manager to discuss their team's performance and support needs.","tf":"12 weeks","ep":"One-to-one notes.","pr":"normal","ms":"","st":"not_started","cr":8,"du":40,"src":"b","up":[],"ev":[]}
  ]$j$::jsonb;

  v_reviews constant jsonb := $j$[
   {"s":"kagiso","r":"thandi","st":"completed","d":9,"min":30,"a":5,"n":"Delivery has slipped for the third fortnight running. Kagiso is open about the causes: system access and unclear priorities on the larger deliveries. We agreed smaller milestones and a Wednesday risk check-in.","b":"Waiting for access to the incident log and competing urgent requests.","su":"Thandi to chase IT and pair Kagiso with Ayesha on the next delivery plan.","ai":["Thandi to escalate the IT access ticket by Friday","Kagiso to update the milestone list every Monday","Ayesha to review the next delivery plan with Kagiso"],"fu":5},
   {"s":"kagiso","r":"thandi","st":"scheduled","d":-4,"min":30,"n":"Agenda: progress on the milestones, the IT access ticket and workload check.","b":"","su":"","ai":[],"fu":null},
   {"s":"ayesha","r":"thandi","st":"completed","d":14,"min":30,"a":5,"n":"Delivery remains reliable and Ayesha is the first person asked when a deadline is tight. The concern is how handovers land with the implementation team. She responded well to the checklist idea.","b":"Little time to brief receiving teams when a delivery is urgent.","su":"Thandi to introduce Ayesha to the implementation leads and protect 30 minutes for handovers.","ai":["Use the handover checklist on every handover","Share the checklist with Daniel's team"],"fu":14},
   {"s":"sipho","r":"thandi","st":"completed","d":21,"min":45,"a":4,"n":"Sipho continues to set the standard in the team. The exception review has cut repeat issues and the coordinators now ask for it. We discussed his interest in a team lead role.","b":"None at the moment. Workload is manageable.","su":"Thandi to build a stretch assignment into the October plan.","ai":["Shadow Thandi in the monthly client review","Draft a proposal for using the exception review in other teams"],"fu":21},
   {"s":"lerato","r":"thandi","st":"completed","d":7,"min":30,"a":7,"n":"A good first fortnight. Lerato asks good questions and has completed her first modules. We agreed objectives for the first ninety days.","b":"Still waiting for access to two client systems.","su":"Kagiso and Sipho to share client account walk-throughs.","ai":["Complete onboarding modules 3 and 4","Shadow two client implementation calls"],"fu":14},
   {"s":"themba","r":"daniel","st":"completed","d":12,"min":30,"a":5,"n":"Themba's delivery has turned around since August. Proposal deadlines are now met and his weekly planning session is clear. The next step is a steadier pipeline of qualified leads.","b":"Lead quality is uneven.","su":"Daniel to share the qualification checklist used on the larger accounts.","ai":["Adopt the lead qualification checklist","Start the call-back routine for warm leads"],"fu":14},
   {"s":"jacques","r":"daniel","st":"completed","d":8,"min":30,"a":5,"n":"Jacques is excellent with customers and colleagues. Review completion is slipping when urgent cases arrive. We discussed agreeing a rule for urgent calls and protecting review slots.","b":"Urgent customer calls break his planned review time.","su":"Daniel to agree an urgent-call rule with the customer care team.","ai":["Agree the urgent-call rule with Daniel by Thursday","Protect two review slots each day"],"fu":7},
   {"s":"fatima","r":"daniel","st":"completed","d":18,"min":30,"a":4,"n":"A steady month. Account relationships are strong. Fatima is piloting the health-check template, which is a good idea and is already surfacing useful themes.","b":"","su":"Daniel to introduce her to the two largest accounts for the next health-checks.","ai":["Complete the health-check on six more accounts"],"fu":21},
   {"s":"michelle","r":"daniel","st":"completed","d":25,"min":30,"a":3,"n":"Michelle continues to deliver strong results. The negotiation programme paid off on the Khoza renewal. We discussed a mentoring role for Themba.","b":"","su":"Daniel to set up a monthly mentoring slot with Themba.","ai":["Mentor Themba on proposal negotiation once a month"],"fu":30},
   {"s":"nomvula","r":"naledi","st":"completed","d":6,"min":30,"a":6,"n":"Nomvula's month-end work is still accurate but her scores have dropped over the last three weeks. She carries frequent interruptions and is blocked by the close calendar sign-off.","b":"Finance sign-off for the close calendar is outstanding; interruptions during the close.","su":"Naledi to raise the calendar sign-off with the head of Finance this week.","ai":["Naledi to get the close calendar signed off by Friday","Nomvula to keep the interruption log during the next close"],"fu":7},
   {"s":"reuben","r":"naledi","st":"completed","d":11,"min":30,"a":6,"n":"Reuben has been steady but requests are closing more slowly than agreed. He is overloaded with facilities requests. We agreed to log every request and review the log weekly.","b":"High volume of facilities requests with no triage.","su":"Naledi to agree a triage rule with the office manager.","ai":["Log every request in the tracker","Review the log with Naledi every Friday"],"fu":-2},
   {"s":"zanele","r":"naledi","st":"completed","d":16,"min":30,"a":4,"n":"Zanele's scores are improving and the onboarding issue log is a real contribution. Her confidence with managers is growing.","b":"","su":"Naledi to involve her in the next policy review.","ai":["Share the onboarding issue log with the managers"],"fu":21},
   {"s":"pieter","r":"naledi","st":"completed","d":20,"min":45,"a":3,"n":"Pieter's analysis is consistently excellent and the managers rely on his weekly pack. We talked about sharing his method with the wider team.","b":"","su":"Naledi to make time in the team meeting for a short demonstration.","ai":["Present the automated performance pack to the team"],"fu":28},
   {"s":"thandi","r":"bob","st":"completed","d":13,"min":45,"a":5,"n":"Thandi's team is delivering reliably and the exception review is reducing repeat issues. The main risks are Kagiso's performance and the pace of Lerato's onboarding. Thandi will give weekly updates on both.","b":"Capacity in the team while Lerato is onboarding.","su":"Bob to support a short-term request for system access for new starters.","ai":["Weekly update on Kagiso's milestones","Review Lerato's onboarding plan in two weeks"],"fu":14},
   {"s":"daniel","r":"bob","st":"completed","d":15,"min":45,"a":5,"n":"Client escalations remain the main concern. Daniel has a plan and the trend is right, but the oldest cases depend on the delivery team. Agreed a joint review with Thandi.","b":"Dependencies on the delivery team for the oldest escalations.","su":"Bob to convene a joint escalation review with Thandi.","ai":["Joint escalation review with Thandi","Report open escalations weekly"],"fu":-1},
   {"s":"naledi","r":"bob","st":"completed","d":22,"min":45,"a":3,"n":"Naledi's team has the best submission discipline in the company. We discussed how to make the review actions more visible to managers.","b":"","su":"","ai":["Include review action closure in the monthly executive pack"],"fu":-3},
   {"s":"naledi","r":"bob","st":"scheduled","d":-3,"min":45,"n":"Agenda: team performance, Nomvula's blocked commitment and the Finance dependency.","b":"","su":"","ai":[],"fu":null}
  ]$j$::jsonb;

  p jsonb; c jsonb; r jsonb; x jsonb; u jsonb;
  v_uid uuid; v_mgr uuid; v_mgr_key text; v_act uuid;
  v_k int; v_ws date; v_cycle uuid; v_bd date; v_ts timestamptz; v_aid uuid; v_dim record;
  v_scores jsonb; v_entries jsonb; v_s int; v_n int; v_h bigint;
  v_cid uuid; v_progress numeric; v_status text; v_created timestamptz; v_ev_ts timestamptz;
  v_created_users int := 0; v_start timestamptz := now();
  v_first_admin uuid;
begin
  select id into v_org from public.organizations where slug = 'vision-activ';
  if v_org is null then raise exception 'Organisation vision-activ does not exist'; end if;

  -- 1. People -----------------------------------------------------------------------------------------------
  for p in select * from jsonb_array_elements(v_people) loop
    select id into v_uid from auth.users where lower(email) = lower((p ->> 'e') || v_domain);
    if v_uid is null then
      if v_pw is null then
        raise exception 'Set the demonstration password first: select set_config(''demo.password'', ''<password>'', false)';
      end if;
      v_uid := md5('vision-activ-demo:user:' || (p ->> 'k'))::uuid;
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        (p ->> 'e') || v_domain, extensions.crypt(v_pw, extensions.gen_salt('bf', 10)),
        ((v_today + (p ->> 'j')::int)::timestamp + interval '12 hours') at time zone 'Africa/Johannesburg',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', p ->> 'n', 'job_title', p ->> 'job', 'demo', true),
        ((v_today + (p ->> 'j')::int)::timestamp + interval '12 hours') at time zone 'Africa/Johannesburg', now(),
        '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_uid, v_uid::text,
        jsonb_build_object('sub', v_uid::text, 'email', (p ->> 'e') || v_domain, 'email_verified', true, 'phone_verified', false),
        'email', null, now(), now());
      v_created_users := v_created_users + 1;
    end if;
  end loop;

  -- Memberships (chief executive first, so reporting-line checks always find the manager)
  for p in select * from jsonb_array_elements(v_people) e order by case e ->> 'r' when 'ceo' then 0 when 'manager' then 1 else 2 end loop
    select id into v_uid from auth.users where lower(email) = lower((p ->> 'e') || v_domain);
    v_mgr := null;
    if p ->> 'm' is not null then
      select id into v_mgr from auth.users where lower(email) = lower((select e ->> 'e' from jsonb_array_elements(v_people) e where e ->> 'k' = p ->> 'm') || v_domain);
    end if;
    insert into public.organization_members (organization_id, user_id, role, manager_user_id, created_at)
    values (v_org, v_uid, p ->> 'r', v_mgr, ((v_today + (p ->> 'j')::int)::timestamp + interval '12 hours') at time zone 'Africa/Johannesburg')
    on conflict (organization_id, user_id) do nothing;
    update public.profiles set created_at = ((v_today + (p ->> 'j')::int)::timestamp + interval '12 hours') at time zone 'Africa/Johannesburg'
    where id = v_uid and created_at > now() - interval '1 hour';
  end loop;

  -- The administrator is not a performer: stop it being reported as a missed scorecard (role and identity untouched).
  update public.organization_members m set performance_tracked = false
  where m.organization_id = v_org and m.role = 'admin' and m.performance_tracked
    and not exists (select 1 from auth.users u where u.id = m.user_id and u.email like '%' || v_domain);

  -- 2. Weekly cycles: history is closed, the current week stays open ----------------------------------------------
  for v_k in -1..7 loop
    insert into public.weekly_cycles (organization_id, week_start, week_end, status, created_at)
    values (v_org, v_w0 - 7 * (7 - v_k), v_w0 - 7 * (7 - v_k) + 6, case when v_k = 7 then 'open' else 'closed' end,
            ((v_w0 - 7 * (7 - v_k))::timestamp + interval '7 hours') at time zone 'Africa/Johannesburg')
    on conflict (organization_id, week_start) do nothing;
  end loop;
  update public.weekly_cycles set status = 'closed' where organization_id = v_org and week_start < v_w0 and status = 'open';

  -- 3. Baselines and weekly scorecards, written as each person ------------------------------------------------------
  for p in select * from jsonb_array_elements(v_people) loop
    select id into v_uid from auth.users where lower(email) = lower((p ->> 'e') || v_domain);
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    v_bd := v_today + (p ->> 'j')::int + 1 + (abs(hashtextextended(p ->> 'k', 1)) % 3)::int;
    v_h := abs(hashtextextended((p ->> 'k') || 'baseline', 2));
    v_ts := (v_bd::timestamp + interval '9 hours' + (v_h % 300) * interval '1 minute') at time zone 'Africa/Johannesburg';
    select jsonb_agg(jsonb_build_object(
             'dimensionId', d.slug,
             'score', pg_temp.demo_score(p ->> 'k', d.slug, 0, p, 'b'),
             'evidence', pg_temp.demo_evidence(d.slug, pg_temp.demo_score(p ->> 'k', d.slug, 0, p, 'b'), (abs(hashtextextended(p ->> 'k' || d.slug, 5)) % 2)::int)) order by d.sort_order)
      into v_scores from public.framework_dimensions d where d.organization_id is null and d.active;
    insert into public.assessments (id, user_id, organization_id, assessment_type, period_start, period_end, scores, submitted_at, created_at)
    values (md5('vision-activ-demo:assessment:' || (p ->> 'k') || ':baseline')::uuid, v_uid, v_org, 'baseline', v_bd, v_bd, v_scores, v_ts, v_ts)
    on conflict do nothing;

    for v_k in (p ->> 'st')::int..7 loop
      continue when (p -> 'skip') @> to_jsonb(v_k);
      v_ws := v_w0 - 7 * (7 - v_k);
      v_h := abs(hashtextextended((p ->> 'k') || v_k::text, 3));
      v_ts := case when v_k = 7
                then least(now() - interval '10 minutes', ((v_ws + (v_h % 2)::int)::timestamp + interval '8 hours' + (v_h % 420) * interval '1 minute') at time zone 'Africa/Johannesburg')
                else ((v_ws + 3 + (v_h % 2)::int)::timestamp + interval '13 hours' + (v_h % 240) * interval '1 minute') at time zone 'Africa/Johannesburg' end;
      select id into v_cycle from public.weekly_cycles where organization_id = v_org and week_start = v_ws;
      select jsonb_agg(jsonb_build_object(
               'dimensionId', d.slug,
               'score', pg_temp.demo_score(p ->> 'k', d.slug, v_k, p, 'w'),
               'evidence', pg_temp.demo_evidence(d.slug, pg_temp.demo_score(p ->> 'k', d.slug, v_k, p, 'w'), (abs(hashtextextended(p ->> 'k' || d.slug || v_k::text, 6)) % 2)::int)) order by d.sort_order),
             jsonb_agg(jsonb_build_object(
               'dimensionId', d.slug,
               'metrics', pg_temp.demo_metrics(d.slug, pg_temp.demo_score(p ->> 'k', d.slug, v_k, p, 'w'), (abs(hashtextextended(p ->> 'k' || d.slug || v_k::text, 8)) % 3)::int),
               'evidence', pg_temp.demo_evidence(d.slug, pg_temp.demo_score(p ->> 'k', d.slug, v_k, p, 'w'), (abs(hashtextextended(p ->> 'k' || d.slug || v_k::text, 6)) % 2)::int)) order by d.sort_order)
        into v_scores, v_entries from public.framework_dimensions d where d.organization_id is null and d.active;
      insert into public.assessments (id, user_id, organization_id, assessment_type, period_start, period_end, scores, submitted_at, created_at)
      values (md5('vision-activ-demo:assessment:' || (p ->> 'k') || ':w' || v_k)::uuid, v_uid, v_org, 'weekly', v_ws, v_ws + 6, v_scores, v_ts, v_ts)
      on conflict do nothing;
      insert into public.scorecard_entries (organization_id, cycle_id, user_id, dimension_id, metrics, evidence, created_at, updated_at)
      select v_org, v_cycle, v_uid, e ->> 'dimensionId', e -> 'metrics', e ->> 'evidence', v_ts, v_ts
      from jsonb_array_elements(v_entries) e
      on conflict (cycle_id, user_id, dimension_id) do nothing;
    end loop;
  end loop;

  -- 4. Commitments: the creation/completion stamps below are the ones the guard trigger would set "now".
  alter table public.commitments disable trigger commitments_before_write;
  for c in select * from jsonb_array_elements(v_commitments) loop
    select id into v_uid from auth.users where lower(email) = lower((select e ->> 'e' from jsonb_array_elements(v_people) e where e ->> 'k' = c ->> 'p') || v_domain);
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_cid := md5('vision-activ-demo:commitment:' || (c ->> 'c'))::uuid;
    v_aid := md5('vision-activ-demo:assessment:' || (c ->> 'p') || ':' || case when c ->> 'src' = 'b' then 'baseline' else 'w' || (c ->> 'src') end)::uuid;
    v_status := c ->> 'st';
    v_created := ((v_today - (c ->> 'cr')::int)::timestamp + interval '9 hours' + (abs(hashtextextended(c ->> 'c', 4)) % 180) * interval '1 minute') at time zone 'Africa/Johannesburg';
    v_progress := case
      when v_status = 'complete' then 100
      when v_status = 'not_started' then 0
      when c ? 'pg' then (c ->> 'pg')::numeric
      when c ->> 'b' is not null and c ->> 'tg' is not null and (c ->> 'cv') is not null
        then greatest(0, least(95, round(((c ->> 'cv')::numeric - (c ->> 'b')::numeric) / ((c ->> 'tg')::numeric - (c ->> 'b')::numeric) * 100)))
      else 10 end;
    insert into public.commitments (
      id, user_id, organization_id, title, action, timeframe, evidence_plan, status, created_at, updated_at,
      dimension_id, due_date, owner_user_id, baseline_value, target_value, progress_percent, priority, blocker,
      completed_at, source_assessment_id, source_score, measure, current_value,
      verification_status, verified_by, verified_at, verification_note, blocked_at)
    values (
      v_cid, v_uid, v_org, c ->> 't', c ->> 'a', c ->> 'tf', c ->> 'ep', v_status, v_created, v_created,
      c ->> 'd', case when c ? 'du' then v_today + (c ->> 'du')::int end, v_uid,
      (c ->> 'b')::numeric, (c ->> 'tg')::numeric, v_progress, c ->> 'pr', coalesce(c ->> 'bl', ''),
      case when v_status = 'complete' then ((v_today - (c ->> 'co')::int)::timestamp + interval '15 hours') at time zone 'Africa/Johannesburg' end,
      (select a.id from public.assessments a where a.id = v_aid),
      (select (e ->> 'score')::smallint from public.assessments a cross join lateral jsonb_array_elements(a.scores) e where a.id = v_aid and e ->> 'dimensionId' = c ->> 'd'),
      coalesce(c ->> 'ms', ''), (c ->> 'cv')::numeric,
      coalesce(c ->> 'vs', 'unverified'),
      case when c ->> 'vs' in ('verified', 'rejected') then (select u.id from auth.users u where lower(u.email) = lower((select e ->> 'e' from jsonb_array_elements(v_people) e where e ->> 'k' = c ->> 'vb') || v_domain)) end,
      case when c ->> 'vs' in ('verified', 'rejected') then ((v_today - (c ->> 'vd')::int)::timestamp + interval '11 hours') at time zone 'Africa/Johannesburg' end,
      coalesce(c ->> 'vn', ''),
      case when v_status = 'blocked' then ((v_today - (c ->> 'blk')::int)::timestamp + interval '10 hours') at time zone 'Africa/Johannesburg' end)
    on conflict (id) do nothing;
  end loop;
  alter table public.commitments enable trigger commitments_before_write;

  -- 5. Progress notes, manager notes, verification trail and evidence ---------------------------------------------
  for c in select * from jsonb_array_elements(v_commitments) loop
    v_cid := md5('vision-activ-demo:commitment:' || (c ->> 'c'))::uuid;
    select user_id into v_uid from public.commitments where id = v_cid;
    select e ->> 'm' into v_mgr_key from jsonb_array_elements(v_people) e where e ->> 'k' = c ->> 'p';
    for u in select * from jsonb_array_elements(c -> 'up') loop
      v_act := case (u ->> 2)
        when 'o' then v_uid
        when 'm' then (select id from auth.users where lower(email) = lower((select e ->> 'e' from jsonb_array_elements(v_people) e where e ->> 'k' = v_mgr_key) || v_domain))
        else (select id from auth.users where lower(email) = lower((select e ->> 'e' from jsonb_array_elements(v_people) e where e ->> 'k' = u ->> 2) || v_domain)) end;
      insert into public.commitment_updates (id, organization_id, commitment_id, user_id, author_id, kind, body, progress_percent, created_at)
      values (md5('vision-activ-demo:update:' || (c ->> 'c') || ':' || (u ->> 0) || ':' || (u ->> 1))::uuid, v_org, v_cid, v_uid, v_act, u ->> 1, u ->> 3,
              case when u -> 4 = 'null'::jsonb then null else (u ->> 4)::numeric end,
              (((v_today - (u ->> 0)::int)::timestamp) + interval '8 hours' + (abs(hashtextextended((c ->> 'c') || (u ->> 0), 9)) % 540) * interval '1 minute') at time zone 'Africa/Johannesburg')
      on conflict (id) do nothing;
    end loop;

    for x in select * from jsonb_array_elements(c -> 'ev') loop
      v_ev_ts := ((v_today - (x ->> 'cd')::int)::timestamp + interval '10 hours' + (abs(hashtextextended((c ->> 'c') || (x ->> 't'), 11)) % 360) * interval '1 minute') at time zone 'Africa/Johannesburg';
      insert into public.evidence_items (id, organization_id, user_id, commitment_id, kind, title, body, url, metric_value,
                                         review_status, reviewed_by, reviewed_at, review_note, created_at)
      values (md5('vision-activ-demo:evidence:' || (c ->> 'c') || ':' || (x ->> 't'))::uuid, v_org, v_uid, v_cid, x ->> 'kd', x ->> 't',
              coalesce(x ->> 'b', ''), x ->> 'u', (x ->> 'mv')::numeric, x ->> 'rs',
              case when x ->> 'rs' <> 'pending' then (select id from auth.users where lower(email) = lower((select e ->> 'e' from jsonb_array_elements(v_people) e where e ->> 'k' = x ->> 'rb') || v_domain)) end,
              case when x ->> 'rs' <> 'pending' then ((v_today - (x ->> 'rd')::int)::timestamp + interval '14 hours') at time zone 'Africa/Johannesburg' end,
              coalesce(x ->> 'rn', ''), v_ev_ts)
      on conflict (id) do nothing;
      -- the evidence trigger logged "Added evidence" at the moment of loading; move it to when it really happened
      update public.commitment_updates set created_at = v_ev_ts
      where commitment_id = v_cid and kind = 'evidence' and body = 'Added evidence: ' || (x ->> 't') and created_at = v_start;
    end loop;

    if c ->> 'vs' in ('verified', 'rejected') then
      insert into public.commitment_updates (id, organization_id, commitment_id, user_id, author_id, kind, body, created_at)
      select md5('vision-activ-demo:update:' || (c ->> 'c') || ':verification')::uuid, v_org, v_cid, v_uid, cm.verified_by, 'verification',
             case cm.verification_status when 'verified' then 'Verified' else 'Rejected / reopened' end || ': ' || cm.verification_note, cm.verified_at
      from public.commitments cm where cm.id = v_cid
      on conflict (id) do nothing;
    end if;
  end loop;

  -- last activity time for each commitment
  update public.commitments cm set updated_at = greatest(cm.created_at, coalesce(
      (select max(u.created_at) from public.commitment_updates u where u.commitment_id = cm.id), cm.created_at))
  where cm.id in (select md5('vision-activ-demo:commitment:' || (e ->> 'c'))::uuid from jsonb_array_elements(v_commitments) e);

  -- 6. Management reviews ------------------------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(v_reviews) loop
    select u.id into v_uid from auth.users u where lower(u.email) = lower((select e ->> 'e' from jsonb_array_elements(v_people) e where e ->> 'k' = r ->> 's') || v_domain);
    select u.id into v_act from auth.users u where lower(u.email) = lower((select e ->> 'e' from jsonb_array_elements(v_people) e where e ->> 'k' = r ->> 'r') || v_domain);
    perform set_config('request.jwt.claims', json_build_object('sub', v_act, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_act::text, true);
    insert into public.management_reviews (id, reviewer_id, subject_user_id, organization_id, assessment_id, notes, barriers, support,
                                           reviewed_at, duration_minutes, action_items, follow_up_date, status)
    values (md5('vision-activ-demo:review:' || (r ->> 's') || ':' || (r ->> 'r') || ':' || (r ->> 'd'))::uuid, v_act, v_uid, v_org,
            case when r ? 'a' then (select a.id from public.assessments a where a.id = md5('vision-activ-demo:assessment:' || (r ->> 's') || ':w' || (r ->> 'a'))::uuid) end,
            r ->> 'n', coalesce(r ->> 'b', ''), coalesce(r ->> 'su', ''),
            ((v_today - (r ->> 'd')::int)::timestamp + interval '10 hours') at time zone 'Africa/Johannesburg',
            (r ->> 'min')::int, r -> 'ai', case when r ->> 'fu' is not null then v_today + (r ->> 'fu')::int end, r ->> 'st')
    on conflict (id) do nothing;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- 7. Notifications: the triggers above produced the event notifications for blocked, completed and verified
  --    work at load time; move them to when those events happened and mark the older ones as read. The scheduled
  --    generator then adds what is due today (overdue, stale verification, review follow-ups).
  update public.notifications n set created_at = x.at,
         read_at = case when x.at < now() - interval '3 days' then x.at + interval '6 hours' end
  from (
    select n2.id,
           case n2.kind when 'blocked' then cm.blocked_at when 'verification_requested' then cm.completed_at else cm.verified_at end as at
    from public.notifications n2 join public.commitments cm on cm.id = n2.entity_id
    where n2.created_at = v_start and n2.kind in ('blocked', 'verification_requested', 'verification_result')
  ) x
  where n.id = x.id and x.at is not null;

  perform private.generate_notifications();

  raise notice 'Demonstration data loaded. New users this run: %', v_created_users;
end
$demo$;

-- Summary
select json_build_object(
  'members', (select count(*) from public.organization_members),
  'by_role', (select json_object_agg(role, n) from (select role, count(*) n from public.organization_members group by 1) t),
  'baselines', (select count(*) from public.assessments where assessment_type = 'baseline'),
  'weekly_assessments', (select count(*) from public.assessments where assessment_type = 'weekly'),
  'scorecard_entries', (select count(*) from public.scorecard_entries),
  'commitments', (select count(*) from public.commitments),
  'commitment_updates', (select count(*) from public.commitment_updates),
  'evidence_items', (select count(*) from public.evidence_items),
  'reviews', (select count(*) from public.management_reviews),
  'notifications', (select count(*) from public.notifications)
) as summary;
