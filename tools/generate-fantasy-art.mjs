import sharp from 'sharp';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public/art/fantasy');
const qa = resolve(root, '.local/art-fantasy-qa');
await mkdir(resolve(output, 'enemies'), { recursive: true });
await mkdir(qa, { recursive: true });
const ink = '#28354c';
const svg = (width, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
const path = (d, fill, stroke = ink, width = 4) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const ellipse = (x, y, rx, ry, fill, stroke = 'none', width = 4) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const rect = (x, y, width, height, fill, radius = 0, stroke = 'none', sw = 4) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const line = (x1, y1, x2, y2, stroke, width = 4) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
const group = (transform, body) => `<g transform="${transform}">${body}</g>`;
const eyes = (x, y, angry = false, color = '#202937') => ellipse(x - 10, y, 4, 5, color) + ellipse(x + 13, y - 1, 4, 5, color) + (angry ? path(`M${x - 19} ${y - 12}l17 6M${x + 4} ${y - 7}l18 -8`, 'none', ink, 4) : '');
const gem = (x, y, size, color = '#49bfe8') => path(`M${x} ${y-size}l${size} ${size}l-${size} ${size}l-${size} -${size}Z`, color, ink, 3) + path(`M${x} ${y-size}v${size * 2}l-${size} -${size}Z`, '#ffffff', 'none', 0).replace('fill="#ffffff"','fill="#ffffff" opacity=".3"');
const sword = () => path('M3 -80L14 -59L9 21L-2 33L-12 20L-9 -57Z', '#dcf5ff') + path('M3 -76L2 24L-9 16L-6 -57Z', '#8ec7df', 'none') + path('M-26 27L24 27L21 39L-20 40Z', '#ffc657') + rect(-5, 39, 12, 29, '#be644f', 3, ink) + ellipse(1, 72, 9, 7, '#ffc657', ink);
const axe = () => rect(-5, -50, 10, 117, '#9b694d', 3, ink) + path('M-5 -51C-35 -62 -40 -25 -25 -11L-5 -23L13 -23C40 -27 42 -55 29 -68C21 -50 6 -46 -5 -51Z', '#b5d9e7') + path('M-30 -47L-23 -20M28 -57L21 -33', 'none', '#eefaff', 4);
const staff = (color = '#ff8c46') => path('M-5 -52L5 -54L13 75L2 77Z', '#8e5b47') + path('M-16 -66Q-25 -48 -9 -40L10 -38Q27 -48 16 -68L11 -49L-9 -48Z', '#ffd475') + gem(0, -76, 14, color) + line(3, -34, 8, 65, '#d7995f', 3);
const bow = () => path('M-10 -85Q64 -6 -7 77L-15 65Q34 -9 -17 -73Z', '#bd764c') + path('M-7 -72Q40 -5 -8 63', 'none', '#f8ce76', 5) + line(-9, -76, -9, 70, '#eef4d8', 2) + line(-33, 0, 45, 0, '#deceaa', 4) + path('M45 0l-13 -8v16Z', '#d9eff6') + path('M-28 0l-10 -9v10l10 8', '#65be77', ink, 2);
const shield = (color = '#d94e58') => path('M-30 -30Q0 -42 30 -30L25 16Q12 39 0 46Q-20 31 -27 14Z', '#f5c25e') + path('M-21 -24Q0 -32 21 -24L17 12Q8 27 0 34Q-12 22 -18 10Z', color, ink, 3) + path('M-2 -20v45M-16 -3h32', 'none', '#ffdc79', 5);

function hero(family) {
  const cape = family === 'blade' ? '#d7495e' : family === 'glass' ? '#7264cb' : '#318a60';
  const cloth = family === 'blade' ? '#5479b7' : family === 'glass' ? '#4785cf' : '#7bb44f';
  let body = path('M91 130Q58 160 60 272L129 256L166 268L153 137Z', cape) + path('M82 143L68 261L94 250L114 144Z', '#00000020', 'none');
  body += path('M93 218L119 218L116 274L91 279Z', '#404760') + path('M127 218L150 218L162 273L136 278Z', '#404760');
  body += path('M88 265L115 267L116 292L79 292Q70 288 78 280Z', '#80563f') + path('M137 267L161 265L174 281Q182 291 170 292L138 292Z', '#80563f') + line(82, 280, 111, 280, '#c48c58', 4) + line(143, 280, 165, 278, '#c48c58', 4);
  body += path('M95 132Q119 122 149 137L156 213L130 233L88 211Z', cloth) + path('M125 136L124 219L148 206L142 144Z', '#00000015', 'none');
  body += path('M91 185L153 185L152 203L90 202Z', '#6a4c43') + rect(115, 185, 20, 17, '#f2c65e', 3, ink, 3) + rect(122, 189, 6, 9, '#78533d', 1);
  body += path('M88 139Q62 153 69 184L88 185L104 156Z', cloth) + ellipse(80, 187, 13, 14, '#efb28a', ink);
  body += path('M148 138Q164 139 167 164L186 167L183 186L157 181L138 159Z', cloth) + ellipse(187, 174, 12, 13, '#efb28a', ink);
  body += rect(112, 111, 25, 26, '#e6a579', 7, ink) + ellipse(122, 90, 34, 38, '#f6c49a', ink) + ellipse(151, 99, 8, 11, '#f6c49a', ink, 3);
  body += path('M89 91Q78 52 113 47Q144 45 155 72L150 88L138 64L122 77L98 71L97 98Z', '#644436') + eyes(126, 91) + path('M120 109q10 8 19 -1', 'none', '#8e5748', 3) + line(119, 101, 125, 102, '#d78a66', 2);
  if (family === 'blade') {
    body += path('M85 73Q91 43 120 43Q151 45 156 72L155 84L137 73L128 57L112 74L86 84Z', '#a9d4e8') + path('M114 43L120 27L134 33L130 45Z', '#ef5f63') + path('M106 138L124 149L143 136L146 182L96 181Z', '#b5dbe9') + path('M76 142L91 132L108 142L99 160L77 159Z', '#d9edf2') + path('M142 136L157 137L168 151L151 161L137 150Z', '#d9edf2');
    body += group('translate(195 140) rotate(15) scale(.83)', sword()) + group('translate(81 202) scale(.76)', shield());
  } else if (family === 'glass') {
    body += path('M82 80L107 28L134 32L153 77Z', '#4967b0') + path('M82 73Q122 60 159 74L166 87Q124 96 76 87Z', '#637fd3') + path('M93 60L140 58L148 74L86 76Z', '#efbf61') + gem(121, 65, 9, '#9becfd');
    body += path('M101 204L89 263L125 271L159 260L146 205Z', '#477ac5') + path('M120 208L125 264', 'none', '#edc45f', 5) + gem(127, 161, 9, '#ffd379') + group('translate(196 171) scale(.92)', staff());
  } else {
    body += path('M88 74Q80 44 110 34Q144 30 154 69L137 66Q121 49 103 72Z', '#3e8052') + path('M105 34Q100 20 94 18L82 42', '#57b873') + path('M98 131L118 145L144 131L151 163L113 175L90 151Z', '#4c9355') + path('M93 150L146 199', 'none', '#8b6244', 11) + rect(138, 201, 15, 22, '#986940', 3, ink, 3) + group('translate(190 169) scale(.83)', bow());
  }
  return body;
}

function humanoid({ skin = '#86bd62', cloth = '#af6448', armor = false, magic = false, crown = false, hood = false, skeletal = false, large = false, icy = false, horn = false, human = false, closedHelmet = false } = {}) {
  const fur = icy ? '#e7f9fc' : '#d9be8d';
  let body = magic ? path('M88 142L155 143L183 289L65 290Z', cloth) + path('M123 159L120 289L167 279L145 164Z', '#00000022', 'none') : path('M91 213L118 213L113 277L86 283Z', '#66596b') + path('M129 213L156 213L173 281L141 284Z', '#66596b');
  body += path('M85 272L112 272L117 292L73 292L75 282Z', '#714c40') + path('M143 271L168 271L182 286L176 292L141 292Z', '#714c40');
  body += path('M84 140L149 136L166 212L135 232L85 219Z', cloth) + path('M144 148L165 165L180 175L175 195L151 187L135 169Z', skin) + ellipse(179, 189, 13, 14, skin, ink) + path('M86 143L62 163L61 204L77 214L92 176Z', skin) + ellipse(66, 207, 14, 16, skin, ink);
  body += path('M83 195L163 190L166 211L86 216Z', '#634745') + rect(112, 194, 22, 17, '#f3be59', 3, ink, 3);
  body += (human || skeletal ? ellipse(84,101,8,12,skin,ink) + ellipse(155,101,8,12,skin,ink) : path('M99 86L70 72L80 111L99 119M145 90L172 77L164 115L147 122', skin)) + ellipse(120, 100, 39, 42, skin, ink);
  if (skeletal) body += ellipse(106, 98, 10, 12, '#455469') + ellipse(135, 97, 10, 12, '#455469') + path('M120 106l-5 12h12Z', '#455469', 'none') + path('M104 124h33v16h-33Z', '#f7efcb') + line(114, 124, 114, 136, ink, 2) + line(126, 124, 126, 136, ink, 2);
  else body += eyes(121, 101, true) + path('M108 121Q125 134 140 119', '#794847', ink, 3) + (human ? '' : path('M111 122l4 11l4 -8M132 124l5 7l2 -10', '#fff4d9', 'none'));
  if (hood) body += path('M79 104Q68 49 113 35Q155 40 162 91L151 103L141 69L102 65L88 105Z', cloth) + path('M89 138L106 151L147 139L158 158L109 177L80 155Z', cloth);
  if (armor) body += path('M92 142L115 153L150 143L158 189L87 195Z', icy ? '#8bddf3' : '#a7bacd') + path('M66 151L88 135L109 145L97 168L69 173Z', icy ? '#c5f0f8' : '#c5d8df') + path('M144 136L164 140L178 158L160 173L141 157Z', icy ? '#c5f0f8' : '#c5d8df');
  if (large) body += path('M79 139L103 151L87 173L59 166Z', fur) + path('M140 139L161 135L177 163L154 174Z', fur);
  if (crown) body += path('M85 72L79 39L101 51L116 28L133 50L155 36L151 74Z', '#ffd062') + gem(119, 57, 10, '#f56c72');
  else if (!hood && armor) body += path('M80 84Q90 53 121 54Q152 54 159 83L150 96L137 75L100 77L91 96Z', icy ? '#b8e8f3' : '#91a5ba');
  if (horn) body += path('M85 68Q65 63 67 39L92 55M148 66Q170 60 169 36L143 54', '#f5d79c');
  if (closedHelmet) body += path('M90 76L144 75L153 119L130 142L96 125Z', '#57647b') + path('M97 93L116 98M130 98L145 91', 'none', '#f8b57b', 5) + path('M122 83v48M103 116l31 3', 'none', '#adb6c5', 3);
  body += group('translate(190 183) scale(.82)', magic ? staff(icy ? '#69d3f2' : '#a581ef') : axe());
  if (crown) body += group('translate(68 211) scale(.7)', shield('#8262b5'));
  return body;
}

function slime(color = '#92d65d') {
  return path('M54 229Q44 180 80 167Q68 127 104 129Q119 101 143 132Q173 128 175 165Q211 174 204 220Q230 244 211 273Q207 294 167 294H76Q43 291 38 270Q24 245 54 229Z', color) + path('M46 248Q93 269 133 253Q183 273 207 246L212 275Q165 307 56 285Z', '#245b6130', 'none') + ellipse(92, 180, 14, 24, '#f2ffd9aa') + ellipse(110, 167, 6, 9, '#f2ffd9aa') + eyes(149, 222) + path('M143 242q13 9 23 -2', 'none', '#36586a', 4) + ellipse(190, 238, 7, 4, '#dfff9d') + path('M76 153l-8 -21l16 8M167 169l21 -8l-12 19', color);
}

function wolf(color = '#a5b6cf', fire = false) {
  let body = path('M58 236Q19 231 26 188Q46 209 65 197L115 189L161 199L183 233L171 269L146 270L126 236L82 248Z', color) + path('M71 234L73 277L91 286L88 293L56 291L50 245Z', color) + path('M139 237L151 279L178 284L179 293L140 292L121 251Z', color);
  body += path('M116 199L118 165L102 137L131 145L157 121L161 150L185 166L212 169L224 184L214 202L177 215L158 239Z', color) + path('M144 189L167 202L210 195L202 216L167 228Z', '#f5f1d8') + path('M204 174L224 183L217 193L204 191Z', '#344157') + ellipse(174, 168, 5, 5, fire ? '#ffdf5d' : '#343951') + path('M164 158l18 2', 'none', ink, 4) + path('M155 224L172 217L160 243L145 237L137 252L118 224Z', '#e2dfce') + path('M167 204l7 10l5 -10', '#fffaf1', ink, 2);
  if (fire) body += path('M47 205Q37 178 54 154Q51 182 72 183Q81 155 107 147Q92 180 122 188L143 197L127 219L93 208L72 222Z', '#ff974e') + path('M70 195l15 -26l8 24l20 10l-23 2Z', '#ffe47b', 'none');
  return body;
}

function elemental(color, icy = false) {
  let body = path('M115 293Q68 286 78 250Q58 235 69 208Q80 190 92 177Q77 148 100 122Q93 153 115 159Q128 130 114 93Q151 111 164 154Q184 145 181 127Q208 165 183 198Q204 221 183 247Q199 273 170 287Z', color);
  body += path('M116 277Q91 248 112 224Q105 194 127 179Q125 214 146 221Q173 246 153 275Z', icy ? '#c4f6ff' : '#ffeaa0', 'none') + eyes(132, 206, true) + path('M62 218l-23 18l17 17l21 -20M187 218l24 6l9 24l-19 10l-13 -19', color);
  if (icy) body += path('M79 162L64 124L94 144L104 101L120 130L145 103L151 143L177 147L157 175Z', '#99def2') + path('M90 143L104 163L102 124M130 145L144 124L145 159', 'none', '#e2fbff', 4);
  return body;
}

function golem() {
  return path('M76 220L112 222L109 283L64 291L58 278Z', '#7ab4d3') + path('M135 221L173 217L184 282L141 292Z', '#82bfd9') + path('M80 117L140 109L169 145L165 224L131 240L83 222L66 164Z', '#9ddbec') + path('M72 133L46 141L30 196L42 232L68 226L86 166Z', '#93c9e1') + path('M159 128L194 142L213 190L201 224L174 219L153 168Z', '#78b6d9') + path('M89 72L132 59L158 82L150 123L117 139L91 115Z', '#b9ecf3') + path('M104 93l15 4M133 92l13 -5', 'none', '#32577b', 5) + path('M85 165l32 -15l18 27l-20 29l-29 -14Z', '#78b7de') + gem(114, 175, 16, '#e9fbff') + path('M76 143l11 21l-15 24M156 168l-12 32l13 10M103 75l16 16l-7 32', 'none', '#e9fbff', 4);
}

function giant() {
  return path('M76 231L111 231L104 287L65 292L59 280ZM140 231L174 226L190 280L179 292L140 288Z', '#749bc2') + path('M77 127L163 122L187 215L162 252L86 246L61 213Z', '#90cede') + path('M82 138L99 170L87 220L63 210L55 154Z', '#6cabc5', 'none') + path('M67 139L39 160L25 212L40 241L69 230L93 174ZM162 135L195 148L217 207L202 236L177 224L149 173Z', '#acddea') + path('M71 145L98 148L113 131L136 149L161 142L179 172L150 182L120 164L95 185L65 174Z', '#e8f7f7') + path('M79 75Q84 44 121 43Q157 42 167 76L157 120L123 144L88 117Z', '#b5e5ed') + path('M79 72L64 42L89 52L102 42L126 26L149 45L173 37L162 72Z', '#83c9e4') + path('M94 91L111 98M134 98L152 89', 'none', '#385f80', 5) + path('M88 114L108 125L122 114L140 127L158 111L151 148L124 173L94 147Z', '#edf9fa') + path('M119 131L124 156L140 137', 'none', '#bedde8', 4) + path('M79 218L171 216L169 233L87 237Z', '#526381') + gem(126,224,13,'#91eff9') + group('translate(203 165) rotate(9)', rect(-5,-44,10,113,'#587693',2,ink) + path('M-25 -71L13 -79L33 -55L25 -30L-15 -24L-31 -44Z','#b8e7f3') + gem(0,-51,13,'#6db7e1'));
}

function dragon() {
  return path('M89 210Q56 240 31 208Q39 265 99 264L121 228Z', '#ae4f78') + path('M110 155L83 82L33 54L48 112L26 138L68 141L76 184Z', '#c0577c') + path('M136 155L174 75L217 43L208 109L233 134L194 147L179 189Z', '#c95b75') + path('M44 76L79 110L84 152M208 68L178 115L166 155', 'none', '#f8a171', 5) + path('M86 240L76 282L102 291L122 286L126 252M143 244L147 283L177 292L192 280L171 239', '#bc647b') + path('M85 284l-8 9l22 1l3 -9M166 285l9 8l17 -1l-11 -11', '#f4d9ac') + path('M93 154Q127 131 159 154Q183 194 169 246L138 271L101 255Q79 215 93 154Z', '#d56c79') + path('M114 167Q142 154 154 181L152 234L133 252L113 239Z', '#ffd291') + path('M110 200h46M110 219h46M118 238h29', 'none', '#d99872', 3) + path('M88 181L64 200L58 224L78 231L107 207M158 180L186 193L201 218L186 230L157 209', '#d56c79') + path('M107 120L84 110L92 80L116 97L151 90L176 108L199 113L214 135L197 151L151 151L139 172L113 161Z', '#df7a7d') + path('M98 86L92 57L121 90M141 93L150 63L161 99', '#f8d59b') + path('M147 126L159 120L169 125', 'none', '#593f59', 5) + ellipse(159, 128, 5, 5, '#ffd778') + ellipse(198, 127, 4, 3, '#703f56') + path('M164 146h33M171 147l5 10l7 -10', '#fff2cd', ink, 3) + path('M92 177l-18 -16l17 -8M84 202l-17 -6l17 -14', '#f3b36c');
}

function item(name) {
  if (name === 'weapon' || name === 'weapon-blade') return group('translate(64 65) rotate(32) scale(.67)', sword());
  if (name === 'weapon-glass') return group('translate(64 68) rotate(27) scale(.59)', staff());
  if (name === 'weapon-needle') return group('translate(66 65) rotate(-15) scale(.59)', bow());
  if (name === 'head') return path('M28 67Q26 31 60 21Q97 20 102 63L93 101L69 108L64 78L54 110L28 99Z', '#99cfe5') + path('M33 66L56 64L53 78L35 80M72 64L95 66L92 80L73 77', '#354861') + path('M57 29L69 29L69 96L62 106L58 78Z', '#e4f4f4') + path('M51 24L58 11L75 15L74 26Z', '#eb6877');
  if (name === 'armor') return path('M32 26L52 20L64 30L78 20L101 30L111 54L91 65L89 100L64 113L34 100L36 65L16 55Z', '#7eb5d5') + path('M34 32L53 26L64 39L79 27L97 33L88 51L65 48L41 53Z', '#c6e6ed') + path('M44 60L62 67L85 59L87 94L65 105L41 94Z', '#b5d9e8') + path('M64 52v49', 'none', '#edf9f9', 4) + path('M34 86h54v13H34Z', '#786044') + rect(56, 84, 17, 16, '#f4c562', 2, ink, 3);
  if (name === 'gloves') return group('translate(17 4)', path('M14 46L23 38L22 16L31 14L36 42L38 12L47 13L49 45L57 21L65 24L59 56L67 45L75 50L64 73L56 83L55 104L22 104L25 81L14 68Z', '#c27a51') + path('M23 82L57 80L64 105L19 109Z', '#719fc3') + line(29, 91, 55, 89, '#cbeaf2', 5));
  if (name === 'boots') return path('M27 19L60 24L54 68L62 85L60 104L24 111L12 100L21 80Z', '#986141') + path('M73 18L101 22L98 70L113 85L112 102L76 109L65 97L70 79Z', '#bb7950') + path('M23 23L58 28L58 42L22 38M71 22L103 26L104 39L70 36', '#e1b968') + path('M24 99L52 94M77 97L104 92', 'none', '#f4ce82', 4);
  if (name === 'ring') return ellipse(64, 72, 26, 28, 'none', ink, 18) + ellipse(64, 72, 26, 28, 'none', '#edb74a', 11) + path('M40 58L32 43L48 20L80 20L96 42L86 59Z', '#fbd26b') + gem(64, 37, 19, '#7dcf9b');
  if (name === 'amulet') return path('M30 19Q25 53 53 72M97 20Q99 47 76 73', 'none', '#d9b258', 7) + path('M54 66L75 66L93 89L77 113L48 113L34 91Z', '#ffd578') + gem(64, 89, 17, '#56c6e3');
  return path('M24 34L42 17L92 23L105 49L98 104L41 111L21 83Z', '#946bc2') + path('M40 26L50 22L56 96L43 106Z', '#bda0e6', 'none') + path('M49 30L89 35L95 95L58 101Z', '#d8b874') + gem(74, 62, 18, '#66d6df') + line(64, 91, 87, 87, '#96693e', 3);
}

const cloud = (x, y, scale = 1) => group(`translate(${x} ${y}) scale(${scale})`, path('M0 20Q-7 1 17 0Q23 -28 54 -14Q72 -35 95 -15Q124 -20 128 3Q153 1 157 20Z', '#effbff', 'none'));
const pine = (x, y, scale = 1, snow = false) => group(`translate(${x} ${y}) scale(${scale})`, rect(-9, -13, 18, 50, '#73675a') + path('M0 -136L-48 -65L-26 -65L-65 -14L-35 -16L-82 36H83L38 -18L65 -15L27 -67L47 -65Z', snow ? '#4c8496' : '#398863', 'none') + (snow ? path('M0 -136L-47 -65L-15 -76L4 -67L26 -79L47 -65ZM0 -76L-60 -17L-29 -28L-8 -20L19 -29L62 -15ZM-1 -22L-76 35L-36 24L-4 31L34 20L75 34Z', '#e6f5fa', 'none') : path('M0 -127L-35 -70L-10 -72L-46 -22L-9 -35L-41 13L8 -2L47 21L27 -16L49 -13L17 -58L32 -58Z', '#4eb578', 'none')));
const tree = (x, y, scale = 1) => group(`translate(${x} ${y}) scale(${scale})`, path('M-16 -75L13 -83L22 91L-29 91L-14 32Z', '#8c654c', 'none') + path('M-5 36L-2 -80M8 -13L45 -51M-9 -10L-44 -41', 'none', '#ac7b52', 10) + path('M-99 -50Q-129 -84 -92 -121Q-104 -154 -57 -167Q-37 -213 6 -183Q45 -205 67 -165Q116 -161 108 -114Q145 -90 107 -59Q96 -18 48 -35Q11 -2 -21 -32Q-74 -13 -99 -50Z', '#35935d', 'none') + path('M-87 -113Q-76 -151 -47 -143Q-29 -176 -1 -157Q26 -177 57 -145Q85 -147 93 -120Q46 -110 32 -90Q1 -107 -32 -83Q-60 -112 -87 -99Z', '#78c75c', 'none') + path('M-53 -56Q-32 -77 -9 -57Q17 -74 42 -53Q3 -20 -31 -42Z', '#4aac58', 'none'));
const flower = (x, y, color) => line(x, y, x, y + 13, '#47905c', 3) + path(`M${x} ${y-7}l5 5l6 -1l-2 6l3 5l-7 1l-4 5l-3 -6l-6 -3l6 -5Z`, color, 'none') + ellipse(x, y + 2, 2, 2, '#ffdc69');

function landscape(region) {
  let body = rect(0, 0, 1200, 600, region === 'terraces' ? '#83d8e8' : region === 'glassgarden' ? '#9abade' : '#c88eb2');
  if (region === 'terraces') {
    body += cloud(45, 76, 1.25) + cloud(698, 74, 1.5) + cloud(1030, 126, .9);
    body += path('M0 302Q154 183 320 271Q438 167 601 253Q790 164 983 266Q1110 209 1200 260V600H0Z', '#83bf83', 'none');
    body += path('M0 325Q178 239 370 323Q570 217 754 313Q1032 233 1200 315V600H0Z', '#4fa86b', 'none');
    body += path('M826 314L826 200L852 200L852 177L870 177L870 201L896 201L896 292L911 298L911 229L953 229L953 206L972 206L972 229L988 229L988 334Z', '#bbcdb6', 'none') + path('M822 204l39 -40l39 40M907 232l44 -42l42 42', '#627a85', 'none') + rect(844, 221, 13, 21, '#708b90', 4) + rect(946, 251, 12, 23, '#708b90', 4);
    body += rect(0, 343, 1200, 257, '#85c86b') + path('M549 305Q724 340 639 401Q563 450 719 492Q746 520 719 600H421Q508 515 471 492Q385 441 548 381Q620 351 509 330Z', '#e3c28c', 'none') + path('M544 329Q671 353 569 397Q477 437 528 466', 'none', '#eed7a5', 16);
    body += tree(68, 338, 1.5) + tree(1118, 358, 1.55) + tree(249, 327, .64) + tree(993, 326, .67);
    body += path('M0 489Q146 457 286 496Q365 469 426 495L395 600H0ZM810 505Q1001 456 1200 491V600H757Z', '#5bab61', 'none');
    for (const [x, y, c] of [[70,460,'#ff8699'],[135,514,'#ffd865'],[250,553,'#cda5ea'],[339,480,'#fff2b0'],[913,539,'#ff8699'],[1035,490,'#fff2b0'],[1148,548,'#cda5ea']]) body += flower(x,y,c);
    body += path('M140 445l-11 -20l20 12l2 -23l11 26M951 473l-5 -27l18 18l13 -21l-3 30', 'none', '#327f54', 6) + path('M289 459l15 -16l28 7l6 17h-52Z', '#adb99b', 'none');
  } else if (region === 'glassgarden') {
    body += cloud(70, 75, 1.3) + cloud(754, 51, 1.7);
    body += path('M0 345L131 118L224 231L394 54L603 314L775 90L935 243L1100 130L1200 292V600H0Z', '#879cca', 'none');
    body += path('M75 215L131 118L194 196L165 187L140 209L116 182ZM283 191L394 54L515 206L450 172L417 204L386 148L338 191ZM696 185L775 90L857 195L813 168L781 189L758 155Z', '#e6f5fa', 'none');
    body += path('M0 393L241 209L446 384L699 239L927 379L1200 260V600H0Z', '#6f9ab6', 'none') + path('M120 303L241 209L355 303L281 280L248 297L216 263ZM618 286L699 239L767 286L723 277L697 283L677 265Z', '#dcecf2', 'none');
    body += path('M0 391Q224 330 451 379Q649 331 849 382Q1055 329 1200 382V600H0Z', '#e0f1f1', 'none') + path('M0 458Q176 415 351 463L415 600H0ZM792 455Q1001 405 1200 468V600H839Z', '#c0dfe5', 'none');
    body += path('M584 356Q444 404 590 439Q738 486 621 600H818Q827 499 673 453Q566 409 644 360Z', '#b0d5e1', 'none') + path('M610 455l75 34l-22 61l-38 14', 'none', '#83bbd5', 7);
    body += pine(78, 387, 1.7, true) + pine(218, 373, .94, true) + pine(1104, 383, 1.65, true) + pine(972, 373, .92, true);
    body += path('M849 365L849 266L888 225L929 266L929 367Z', '#7d9bb9', 'none') + path('M862 347V286L889 265L912 286V347Z', '#425f85', 'none') + path('M839 270L888 217L939 270L912 261L887 241L863 266Z', '#e9f6f7', 'none');
    body += path('M288 505l-11 -42l18 12l15 -30l9 57l-16 18ZM899 550l5 -61l21 20l18 -33l13 68Z', '#8fd7e7', '#579fbb', 3) + path('M291 477l10 32M920 510l14 31', 'none', '#e2faff', 4);
  } else {
    body += cloud(131, 77, 1.0).replaceAll('#effbff','#ebbad0') + cloud(793, 91, 1.4).replaceAll('#effbff','#edbed0');
    body += path('M0 342L146 150L341 334L579 117L821 335L1036 108L1200 323V600H0Z', '#956783', 'none') + path('M518 171L579 117L655 187L601 173L581 186L563 168Z', '#f3a27f', 'none');
    body += path('M0 365L226 234L387 385L727 202L983 370L1200 252V600H0Z', '#775875', 'none');
    body += path('M887 354L887 243L918 243L918 219L942 219L942 246L961 246L961 315L979 315L979 176L997 176L997 151L1015 151L1015 176L1034 176L1034 317L1050 317L1050 247L1074 247L1074 221L1093 221L1093 247L1115 247L1115 355Z', '#4f4b65', 'none') + rect(984, 276, 41, 65, '#ed976b', 12) + rect(923, 269, 13, 30, '#ffbe75', 5) + rect(1070, 269, 13, 30, '#ffbe75', 5);
    body += path('M0 377Q284 329 477 381Q643 330 858 384Q1096 332 1200 380V600H0Z', '#aa7377', 'none');
    body += path('M740 346Q682 405 806 431Q914 467 820 526L765 600H991Q1085 510 939 454Q792 417 820 347Z', '#f98555', 'none') + path('M771 360Q724 409 849 437Q973 480 865 555L839 600H911Q1021 497 902 454Q755 411 798 358Z', '#ffcc70', 'none');
    body += path('M0 479L59 451L107 466L177 429L260 462L309 451L386 481L403 600H0ZM998 509L1038 464L1092 481L1145 432L1200 463V600H991Z', '#765973', 'none') + path('M145 433L124 343L91 302L107 295L146 330L143 262L159 257L163 339L198 308L211 312L165 364L177 429Z', '#624b66', 'none') + path('M1119 440L1093 358L1059 323L1071 312L1104 342L1105 295L1120 294L1127 365L1153 348L1160 360L1131 392L1145 432Z', '#634b67', 'none');
    body += path('M324 505l-16 -44l30 17l8 -31l17 60ZM76 543l-11 -30l25 -16l24 31l-4 17Z', '#d88a83', 'none') + path('M364 561l37 -21l35 11l23 -24', 'none', '#e4a07a', 4);
  }
  return body;
}

const enemies = {
  porcelain: humanoid(), splinter: slime(), gardener: humanoid({skin:'#85b75a', cloth:'#a37043', large:true}),
  keeper: humanoid({skin:'#e9ad83',cloth:'#537db0',armor:true,human:true}), rose: wolf('#a78d79'), loom: humanoid({skin:'#e6ad82',cloth:'#8760a0',magic:true,hood:true,human:true}),
  cantor: humanoid({skin:'#93c66a',cloth:'#bf5569',armor:true,crown:true}),
  barkguard: humanoid({skin:'#9fccda',cloth:'#5a7d9d',large:true,horn:true,icy:true}), chime: wolf('#a9d1e4'), dewweaver: humanoid({skin:'#c8dfe6',cloth:'#558fc3',magic:true,hood:true,icy:true,human:true}),
  cupkeeper: golem(), dewsplinter: elemental('#70b8df',true), memoryweaver: humanoid({skin:'#efe7c8',cloth:'#7564a8',magic:true,hood:true,skeletal:true,icy:true}),
  heartchoir: giant(),
  bankguard: humanoid({skin:'#9caf68',cloth:'#b86649',armor:true,large:true,horn:true}), redshard: elemental('#ef8859'), floodweaver: humanoid({skin:'#c78d6b',cloth:'#a35476',magic:true,hood:true,human:true}),
  weftguard: humanoid({skin:'#9b859e',cloth:'#54465f',armor:true,horn:true,closedHelmet:true}), scarletshard: wolf('#a46174',true), knotweaver: humanoid({skin:'#d4a19c',cloth:'#bb635b',magic:true,hood:true,human:true}), lockmaster: dragon(),
};
const assets = [];
async function save(name, width, height, body, assetId) {
  const filename = `${name}.png`;
  const image = await sharp(Buffer.from(svg(width,height,body))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(resolve(output,filename), image);
  assets.push({ assetId, path: `/art/fantasy/${filename}`, width, height, bytes: image.length, sha256: createHash('sha256').update(image).digest('hex'), transparent: width !== 1200 });
}
for (const region of ['terraces','glassgarden','carmine']) await save(region,1200,600,landscape(region),`background.${region}`);
for (const family of ['blade','glass','needle']) await save(`hero-${family}`,256,320,hero(family),`hero.${family}`);
for (const [id,body] of Object.entries(enemies)) await save(`enemies/${id}`,256,320,body,`enemy.${id}`);
for (const [kind,id] of Object.entries({sentinel:'porcelain',shard:'splinter',weaver:'loom',boss:'cantor'})) await save(`enemy-${kind}`,256,320,enemies[id],`enemy.fallback.${kind}`);
for (const name of ['weapon','weapon-blade','weapon-glass','weapon-needle','focus','head','armor','gloves','boots','amulet','ring']) await save(`item-${name}`,128,128,item(name),`item.${name}`);
await save('emblem',128,128,group('translate(64 64) scale(1.1)',shield('#478fc1')) + group('translate(65 64) rotate(28) scale(.46)',sword()),'emblem');

const validation = [];
for (const asset of assets) {
  const file = resolve(root,`public${asset.path}`);
  const metadata = await sharp(file).metadata();
  if (metadata.width !== asset.width || metadata.height !== asset.height || !metadata.hasAlpha) throw new Error(`Invalid PNG dimensions/alpha: ${asset.path}`);
  if (asset.transparent) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let nonempty = 0, edge = 0;
    for (let y=0;y<info.height;y++) for (let x=0;x<info.width;x++) {
      const alpha = data[(y*info.width+x)*4+3];
      if (alpha>16) nonempty++;
      if (x<8 || y<8 || x>=info.width-8 || y>=info.height-8) edge = Math.max(edge,alpha);
    }
    if (nonempty<200 || edge>16) throw new Error(`Empty sprite or unsafe alpha margin: ${asset.path}, edge ${edge}`);
    validation.push({path:asset.path,nonemptyPixels:nonempty,safeMarginAlpha:edge});
  }
}
await writeFile(resolve(output,'manifest.json'),`${JSON.stringify({schema:'shov.fantasy.static.v1',revision:2,generator:'tools/generate-fantasy-art.mjs',provenance:'Original geometric cartoon illustrations authored for SHOV. No third-party image sources. Static development assets; no frame animation implied.',assets},null,2)}\n`);

const actorAssets = assets.filter(a=>a.assetId.startsWith('hero.') || a.assetId.startsWith('enemy.') && !a.assetId.includes('fallback'));
const layers = [];
for (let i=0;i<actorAssets.length;i++) {
  const a=actorAssets[i], x=(i%6)*200,y=Math.floor(i/6)*276;
  layers.push({input:await sharp(resolve(root,`public${a.path}`)).resize(192,240).toBuffer(),left:x+4,top:y+24});
  layers.push({input:Buffer.from(svg(200,24,`<text x="10" y="18" font-size="13" font-family="sans-serif" fill="#28354c">${a.assetId}</text>`)),left:x,top:y});
}
await sharp({create:{width:1200,height:Math.ceil(actorAssets.length/6)*276,channels:4,background:'#eaf0f3'}}).composite(layers).png().toFile(resolve(qa,'actors.png'));
await sharp({create:{width:1200,height:1800,channels:4,background:'#eaf0f3'}}).composite(await Promise.all(['terraces','glassgarden','carmine'].map(async (r,i)=>({input:await readFile(resolve(output,`${r}.png`)),left:0,top:i*600})))).png().toFile(resolve(qa,'landscapes.png'));
await sharp({create:{width:768,height:320,channels:4,background:'#293340'}}).composite(await Promise.all(['blade','glass','needle'].map(async(f,i)=>({input:await readFile(resolve(output,`hero-${f}.png`)),left:i*256,top:0})))).png().toFile(resolve(qa,'hero-alpha.png'));
await writeFile(resolve(qa,'validation.json'),`${JSON.stringify({passed:true,pngCount:assets.length,totalBytes:assets.reduce((sum,a)=>sum+a.bytes,0),validation},null,2)}\n`);
console.log(`Generated and validated ${assets.length} original PNGs (${Math.round(assets.reduce((sum,a)=>sum+a.bytes,0)/1024)} KiB). Contact sheets: ${qa}`);
