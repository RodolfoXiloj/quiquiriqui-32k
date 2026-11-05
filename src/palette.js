// Single source of truth for every color in the game: a bright, sunny farm palette.
// Each index has one role. Weather tints (rain, snow, night, dawn) are applied on top later.
export const PALETTE = [
  '#1d1a2f', // 0  ink: sprite outlines, text shadow
  '#3b5f2a', // 1  grass dark
  '#5d8b32', // 2  grass mid
  '#8fbf45', // 3  grass light
  '#c8e070', // 4  grass sunlit tips
  '#7a5232', // 5  dirt dark
  '#a8774a', // 6  dirt light
  '#f4f0e6', // 7  hen feathers
  '#cbbca3', // 8  hen feather shade
  '#e0402f', // 9  comb and wattle red
  '#f7b733', // 10 beak, legs, corn gold
  '#ff8fb1', // 11 flower pink
  '#7fd4ff', // 12 sky and water blue
  '#ffffff', // 13 pure white: hit flash, HUD text
  '#8a6bbe', // 14 flower violet, UI accent
  '#2b2b44', // 15 UI panel dark
  '#a7a3b8', // 16 rat fur
  '#625e78', // 17 rat shade, tail
  '#ee7a2c', // 18 fox fur
  '#a3461b', // 19 fox shade
];
