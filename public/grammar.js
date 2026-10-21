// grammar.js
// the house's message grammar, shared by the server and the page
// the page uses it to build messages, the server uses it to check them
// so nobody can sneak a message onto the floor that the grammar can't make

// the ways a message can be said
// ___ is a blank, filled with a word the house already knows
export let templates = [
  "formerly a ___",
  "___ of ___",
  "___ here",
  "kept here: ___",
  "the ___ again",
  "property of the ___",
  "___ removed",
  "see the ___",
  "the ___ is ___",
  "___ below",
  "reserved for the ___",
  "___ was here first",
  "like the ___",
  "no ___ here",
  "___ ahead",
  "the ___ was moved",
  "___ behind",
  "___?",
  "___…",
  "___",
];

// the second half of a message only gets the short ones
// (long + long gets muddy fast, we tested it)
export let shortTemplates = ["___", "___?", "___…", "___ removed", "the ___ again", "___ below"];

// words that join the two halves
// these are about tone more than logic, same as elden ring
export let joiners = ["and then", "or", "but", "except", "so to speak", ","];

// how many blanks a template has
export function countBlanks(template) {
  return template.split("___").length - 1;
}

// put words into a template's blanks, in order
// "formerly a ___" drops the "a" if the word looks plural (ends in s)
export function fill(template, words) {
  let i = 0;
  let text = template.replace(/___/g, () => words[i++] || "___");
  if (template == "formerly a ___" && words[0] && words[0].endsWith("s")) {
    text = "formerly " + words[0];
  }
  return text;
}

// turn a stored message into the line you read on the floor
// a message looks like { t: 3, w: ["pool"], j: 1, t2: 0, w2: ["stone"] }
// t is which template, w is its words, j / t2 / w2 are the optional second half
export function messageText(m) {
  if (!m) return "";
  let text = fill(templates[m.t], m.w);
  if (m.j == undefined) return text;
  let second = fill(shortTemplates[m.t2], m.w2);
  let joiner = joiners[m.j];
  if (joiner == ",") {
    // no comma after a question mark or a trailing off
    let ends = text.endsWith("?") || text.endsWith("…");
    return text + (ends ? " " : ", ") + second;
  }
  return text + " " + joiner + " " + second;
}
