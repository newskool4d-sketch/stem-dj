import test from "node:test";
import assert from "node:assert/strict";
import { fmtTime, playbackSupportHint } from "../static/util.js";

test("fmtTime formats seconds as MM:SS", () => {
  assert.equal(fmtTime(0), "00:00");
  assert.equal(fmtTime(75), "01:15");
  assert.equal(fmtTime(600), "10:00");
});

test("fmtTime returns 00:00 for non-finite input", () => {
  assert.equal(fmtTime(NaN), "00:00");
  assert.equal(fmtTime(Infinity), "00:00");
});

test("playbackSupportHint warns about protected m4a/aac", () => {
  assert.match(playbackSupportHint("song.m4a"), /Apple Music/);
  assert.match(playbackSupportHint("song.AAC"), /Apple Music/);
});

test("playbackSupportHint warns about flac support", () => {
  assert.match(playbackSupportHint("song.flac"), /FLAC/);
});

test("playbackSupportHint falls back to generic hint", () => {
  assert.match(playbackSupportHint("song.mp3"), /MP3, WAV/);
});
