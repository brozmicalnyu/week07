// script.js
// the page for compound: walking the house, saying rooms, leaving messages
// it talks to the server with fetch(): GET /data to read the house, POST /new-data to add to it

// the same message grammar the server checks against
import { templates, shortTemplates, joiners, countBlanks, messageText } from "./grammar.js";

// ---- what the page knows ----

let rooms = []; // every room in the house, from /data
let words = []; // every word the house knows, from /data
let here = { col: 0, row: 0 }; // where you're standing (everyone starts at the entrance)
let target = null; // the empty cell you're saying a room into, when you're saying one

// the message you're putting together
// t = which template, w = its words, j / t2 / w2 = the second half (only after pressing +)
let draft = { t: 0, w: [] };

// north, east, south, west, and how each one moves you on the grid
let dirs = {
  n: { col: 0, row: 1, name: "N" },
  e: { col: 1, row: 0, name: "E" },
  s: { col: 0, row: -1, name: "S" },
  w: { col: -1, row: 0, name: "W" },
};

// the six typed parts of a room, in sentence order
let parts = ["size", "room", "material", "object", "act", "light"];

// grab an element by id, saves typing document.getElementById every time
let $ = (id) => document.getElementById(id);


// ---- talking to the server ----

// ROUTE 3 from the page's side: ask for the whole house
async function readHouse() {
  let res = await fetch("/data");
  let data = await res.json();
  rooms = data.rooms;
  words = data.words;
}

// ROUTE 2 from the page's side: send a new room to be stored
async function sayRoom(room) {
  let res = await fetch("/new-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(room),
  });
  // the server answers with { status: "said" } or { status: "refused", reason: "..." }
  return await res.json();
}


// ---- small helpers ----

// the room at a col,row, or undefined if nothing's been said there
function roomAt(col, row) {
  return rooms.find((r) => r.col == col && r.row == row);
}

// "a" or "an", depending on the word after it
function article(word) {
  return /^[aeiou]/.test(word) ? "An" : "A";
}

// one part of a sentence, red if the house recognised it
function markWord(r, part) {
  let cls = r.red && r.red.includes(part) ? "red" : "";
  return `<span class="${cls}">${r[part]}</span>`;
}

// the room's full sentence, with red words marked
function sentenceFor(r) {
  return (
    `${article(r.size)} ${markWord(r, "size")} ${markWord(r, "room")} of ${markWord(r, "material")}.<br>` +
    `There is a ${markWord(r, "object")} that ${markWord(r, "act")}.<br>` +
    `The light is ${markWord(r, "light")}.`
  );
}

// show only the boxes listed, hide the rest
function show(ids) {
  let all = ["intro", "enter", "here", "floor", "doors", "unsaid", "leave", "actions", "note"];
  all.forEach((id) => $(id).classList.toggle("hidden", !ids.includes(id)));
}

// a line of feedback under everything
function say(text) {
  $("note").textContent = text;
  $("note").classList.remove("hidden");
}


// ---- standing in a room ----

function markRoom() {
  let r = roomAt(here.col, here.row);
  show(["here", "floor", "doors"]);

  $("sentence").innerHTML = sentenceFor(r);
  $("message").textContent = r.message ? messageText(r.message) : "nothing has been left here.";

  // label each doorway with the room behind it, or "not said"
  document.querySelectorAll("#doors .btn").forEach((btn) => {
    let d = dirs[btn.dataset.dir];
    let next = roomAt(here.col + d.col, here.row + d.row);
    btn.textContent = d.name + "  " + (next ? next.room : "not said");
    btn.classList.toggle("red", !!(next && next.red.includes("room")));
  });
}

// pressing a doorway: walk in if it's said, otherwise start saying it
async function goThrough(dir) {
  let d = dirs[dir];
  let col = here.col + d.col;
  let row = here.row + d.row;

  // read the house again first, someone else may have said this room meanwhile
  await readHouse();

  if (roomAt(col, row)) {
    here = { col: col, row: row };
    markRoom();
  } else {
    target = { col: col, row: row };
    markUnsaid();
  }
}


// ---- saying a room ----

function markUnsaid() {
  show(["unsaid", "leave", "actions"]);

  // clear the blanks from last time
  parts.forEach((p) => ($(p).value = ""));

  // fill each blank's suggestions with what others have said in that slot
  parts.forEach((p) => {
    let said = [...new Set(rooms.map((r) => r[p]))];
    $(p + "-words").innerHTML = said.map((w) => `<option value="${w}"></option>`).join("");
  });

  draft = { t: 0, w: [] };
  markDraft();
  markChips();
}

// the words you can put in a message: the house's, plus the room you're saying now
function wordsNow() {
  let typed = ["size", "room", "material", "object", "light"]
    .map((p) => $(p).value.trim().toLowerCase())
    .filter((w) => w);
  return [...new Set(words.concat(typed))].sort();
}

// draw the message as it stands, blanks as empty boxes
function markDraft() {
  let first = templates[draft.t];
  let html = blanksFor(first, draft.w);
  if (draft.j != undefined) {
    let joiner = joiners[draft.j];
    html += (joiner == "," ? ", " : " " + joiner + " ") + blanksFor(shortTemplates[draft.t2], draft.w2);
  }
  $("draft").innerHTML = html;
}

// one template, with chosen words in place and empty boxes where words are missing
function blanksFor(template, chosen) {
  let bits = template.split("___");
  let out = "";
  bits.forEach((bit, i) => {
    out += bit;
    if (i < bits.length - 1) out += `<span class="blank">${chosen[i] || "&nbsp;"}</span>`;
  });
  return out;
}

// the row of word chips under the message
function markChips() {
  let chosen = draft.w.concat(draft.w2 || []);
  $("words").innerHTML = wordsNow()
    .map((w) => `<button class="chip ${chosen.includes(w) ? "on" : ""}" data-word="${w}">${w}</button>`)
    .join("");
}

// tapping a word drops it into the next empty blank
// once every blank is full, the next tap starts the message over
function pickWord(word) {
  let firstNeeds = countBlanks(templates[draft.t]);
  let secondNeeds = draft.j != undefined ? countBlanks(shortTemplates[draft.t2]) : 0;

  if (draft.w.length >= firstNeeds && (draft.w2 || []).length >= secondNeeds) {
    draft.w = [];
    if (draft.j != undefined) draft.w2 = [];
  }
  if (draft.w.length < firstNeeds) draft.w.push(word);
  else draft.w2.push(word);

  markDraft();
  markChips();
}

// ↻ : another way of saying the half you're working on
function anotherWay() {
  if (draft.j != undefined) {
    draft.t2 = (draft.t2 + 1) % shortTemplates.length;
    draft.w2 = [];
  } else {
    draft.t = (draft.t + 1) % templates.length;
    draft.w = [];
  }
  markDraft();
  markChips();
}

// + : add a second half, then each press tries the next joiner, then takes it away again
function more() {
  if (draft.j == undefined) {
    draft.j = 0;
    draft.t2 = 0;
    draft.w2 = [];
  } else if (draft.j < joiners.length - 1) {
    draft.j = draft.j + 1;
  } else {
    delete draft.j;
    delete draft.t2;
    delete draft.w2;
  }
  markDraft();
  markChips();
}

// the message to send, or null if nothing was chosen
// (a half-finished message counts as "not finished", the page asks you to finish it)
function finishedMessage() {
  if (draft.w.length == 0) return null;
  let full = draft.w.length == countBlanks(templates[draft.t]);
  if (draft.j != undefined) full = full && draft.w2.length == countBlanks(shortTemplates[draft.t2]);
  return full ? draft : "unfinished";
}

// SAY IT
async function sayIt() {
  let room = { col: target.col, row: target.row };
  parts.forEach((p) => (room[p] = $(p).value));

  let message = finishedMessage();
  if (message == "unfinished") {
    say("the message on the floor is not finished.");
    return;
  }
  room.message = message;

  let answer = await sayRoom(room);
  if (answer.status != "said") {
    say(answer.reason);
    return;
  }

  // it's in the house now: read the house again and walk into the room you said
  await readHouse();
  here = { col: target.col, row: target.row };
  target = null;
  markRoom();
}


// ---- wiring up the buttons ----

$("enter").addEventListener("click", async () => {
  await readHouse();
  markRoom();
});

document.querySelectorAll("#doors .btn").forEach((btn) => {
  btn.addEventListener("click", () => goThrough(btn.dataset.dir));
});

$("words").addEventListener("click", (e) => {
  if (e.target.dataset.word) pickWord(e.target.dataset.word);
});

$("another").addEventListener("click", anotherWay);
$("more").addEventListener("click", more);
$("say").addEventListener("click", sayIt);
$("back").addEventListener("click", markRoom);

// typing a room's words adds them to the message chips straight away
parts.forEach((p) => $(p).addEventListener("input", markChips));
