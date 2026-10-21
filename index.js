// index.js
// the server for compound, an infinite house the dead speak into existence
// run it with: npm install, then node index.js
// then go to localhost:3000 in the browser

// bring in express and lowdb (installed with npm install express lowdb)
// lowdb only works with "import", which is why package.json says "type": "module"
import express from "express";
import { JSONFilePreset } from "lowdb/node";

// the message grammar lives in public/grammar.js so the page can use it too
// the server imports the same file, so both sides agree on what a message can be
import { templates, shortTemplates, joiners, countBlanks } from "./public/grammar.js";

// make the app, this is basically the server itself
let app = express();

// railway gives us a port in process.env.PORT, on my laptop it's just 3000
let port = process.env.PORT || 3000;

// lets the server read json sent from the page with fetch()
// without this, req.body is undefined in the POST route
app.use(express.json());

// ROUTE 1
// anything inside "public" gets served as-is, so "/" gives you public/index.html
// import.meta.dirname is the folder index.js lives in (same job as __dirname last week)
app.use(express.static(import.meta.dirname + "/public"));


// ---- the house before anyone came ----

// the entrance, said by the house itself, sitting at 0,0
let entrance = {
  col: 0, row: 0,
  size: "tall", room: "hall", material: "lime",
  object: "chair", act: "faces the wall", light: "borrowed",
  by: "house", said: new Date().toISOString(),
};

// the house's own rooms, one gets placed for every 10 rooms visitors say
// three kinds of dead, mixed together, released in shuffled order
// these are allowed to break the grammar a little (teak, small, never off)
// because the house said them before anyone else
let houseRooms = [
  { size: "tall", room: "drawing room", material: "teak", object: "mirror", act: "faces the wall", light: "borrowed" },
  { size: "wide", room: "billiard room", material: "lime", object: "table", act: "is still warm", light: "dim" },
  { size: "long", room: "dressing room", material: "plaster", object: "cupboard", act: "has been moved", light: "green" },
  { size: "low", room: "servants' quarters", material: "brick", object: "bed", act: "belongs to the next room", light: "coming from below" },
  { size: "narrow", room: "back kitchen", material: "brick", object: "door", act: "is still warm", light: "absent" },
  { size: "low", room: "wash yard", material: "concrete", object: "window", act: "has no glass", light: "borrowed" },
  { size: "narrow", room: "ironing room", material: "timber", object: "chair", act: "faces the wall", light: "dim" },
  { size: "low", room: "interrogation room", material: "concrete", object: "chair", act: "faces the wall", light: "never off" },
  { size: "narrow", room: "holding room", material: "concrete", object: "door", act: "leads nowhere", light: "dim" },
  { size: "small", room: "visiting room", material: "glass", object: "table", act: "hums", light: "borrowed" },
  { size: "low", room: "guardhouse", material: "plaster", object: "bed", act: "has been moved", light: "coming from below" },
  { size: "long", room: "waiting room", material: "concrete", object: "bell", act: "hums", light: "absent" },
];

// words the house recognises. these come back red, for everyone, wherever they're used
// this list only lives here on the server, so you can't find it by opening devtools
// the only way to find out what the house knows is to say it
// (the drawing room and its kind stay white on purpose: theirs is the house's official voice)
let recognised = [
  "servants' quarters", "servants quarters", "quarters", "servant",
  "back kitchen", "wash yard", "ironing room",
  "interrogation room", "holding room", "visiting room", "guardhouse", "waiting room",
  "concrete", "never off", "cell", "statement", "remand",
];

// the six parts of a room, in the order the sentence says them
let parts = ["size", "room", "material", "object", "act", "light"];


// ---- the database ----

// db.json is made the first time the server runs, holding just the entrance
// rooms: every room ever said
// spoken: how many rooms visitors have said (so we know when it's every 10th)
// bag: the house's rooms still waiting to be placed, in shuffled order
let db = await JSONFilePreset(import.meta.dirname + "/db.json", {
  rooms: [entrance],
  spoken: 0,
  bag: [],
});


// ---- little helpers ----

// is there already a room at this col,row?
function roomAt(col, row) {
  return db.data.rooms.find((r) => r.col == col && r.row == row);
}

// the four cells next to a cell (north is row + 1)
function neighbours(col, row) {
  return [
    { col: col, row: row + 1 },
    { col: col + 1, row: row },
    { col: col, row: row - 1 },
    { col: col - 1, row: row },
  ];
}

// shuffle a list in place (fisher-yates, the usual way)
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    let keep = list[i];
    list[i] = list[j];
    list[j] = keep;
  }
  return list;
}

// a typed word is fine if it's letters, spaces or apostrophes, 1 to 25 long
function okWord(word) {
  return typeof word == "string" && /^[a-z' ]{1,25}$/.test(word);
}

// every single word the house knows so far, for the message dropdowns
// (not the "act" part, those are little phrases like "faces the wall")
function knownWords() {
  let words = new Set();
  db.data.rooms.forEach((r) => {
    words.add(r.size);
    words.add(r.room);
    words.add(r.material);
    words.add(r.object);
    words.add(r.light);
  });
  return [...words].sort();
}

// which parts of a room the house recognises
// e.g. ["room", "material"] for a waiting room of concrete
function redParts(r) {
  return parts.filter((p) => recognised.some((word) => r[p].includes(word)));
}

// check a message the page sent against the grammar
// every word has to be one the house already knows
function okMessage(m, known) {
  if (!m) return true; // leaving nothing is fine
  if (!templates[m.t]) return false;
  if (!Array.isArray(m.w) || m.w.length != countBlanks(templates[m.t])) return false;
  if (!m.w.every((w) => known.includes(w))) return false;
  if (m.j == undefined) return true; // no second half
  if (!joiners[m.j] || !shortTemplates[m.t2]) return false;
  if (!Array.isArray(m.w2) || m.w2.length != countBlanks(shortTemplates[m.t2])) return false;
  return m.w2.every((w) => known.includes(w));
}

// every 10th room a visitor says, the house says one of its own right next to it
function houseSpeaks(next) {
  // refill the bag when it's empty, so the same rooms come round again in a new order
  if (db.data.bag.length == 0) {
    db.data.bag = shuffle(houseRooms.map((r, i) => i));
  }
  // find an empty cell beside the room that was just said
  let free = shuffle(neighbours(next.col, next.row)).find((c) => !roomAt(c.col, c.row));
  if (!free) return; // boxed in, the house waits for the next time
  let pick = houseRooms[db.data.bag.shift()];
  db.data.rooms.push({ ...pick, col: free.col, row: free.row, by: "house", said: new Date().toISOString() });
}


// ROUTE 2
// "/new-data" receives a new room from the page with fetch() POST
// it checks the room, stores it in db.json, and tells the page it was said
app.post("/new-data", async (req, res) => {
  let body = req.body;
  let col = Number(body.col);
  let row = Number(body.row);

  // tidy the six typed words: lowercase, no extra spaces
  let room = { col: col, row: row };
  for (let p of parts) {
    room[p] = String(body[p] || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // the checks. each one sends back a reason the page can show
  if (!Number.isInteger(col) || !Number.isInteger(row)) {
    return res.status(400).json({ status: "refused", reason: "that is not a place in the house." });
  }
  if (!parts.every((p) => okWord(room[p]))) {
    return res.status(400).json({ status: "refused", reason: "every part of the room has to be said, in letters." });
  }
  if (roomAt(col, row)) {
    return res.status(409).json({ status: "refused", reason: "someone has already said this room." });
  }
  if (!neighbours(col, row).some((c) => roomAt(c.col, c.row))) {
    return res.status(400).json({ status: "refused", reason: "a room has to touch the house." });
  }

  // the message can use the words of the room being said right now too
  let known = knownWords().concat([room.size, room.room, room.material, room.object, room.light]);
  if (!okMessage(body.message, known)) {
    return res.status(400).json({ status: "refused", reason: "the house cannot say that message." });
  }

  // all good, store it
  room.message = body.message || null;
  room.by = "ghost";
  room.said = new Date().toISOString();
  db.data.rooms.push(room);
  db.data.spoken = db.data.spoken + 1;

  // every 10th visitor room, the house adds one of its own
  if (db.data.spoken % 10 == 0) houseSpeaks(room);

  // write db.json to disk
  await db.write();

  // respond to the page that it worked
  res.json({ status: "said", room: room });
});


// ROUTE 3
// "/data" sends every room back to the page as json
// each room comes with "red": the parts the house recognised
// plus "words": every word the house knows, for building messages
app.get("/data", (req, res) => {
  let rooms = db.data.rooms.map((r) => ({ ...r, red: redParts(r) }));
  res.json({ rooms: rooms, words: knownWords() });
});


// start listening
app.listen(port, () => {
  console.log("compound is open on port " + port);
});
