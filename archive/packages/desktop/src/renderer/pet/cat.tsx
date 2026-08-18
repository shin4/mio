import type { Component } from "solid-js"
import type { PetSessionStatus } from "@opencode-ai/app/pet"

// 大橘猫 — a chibi sitting orange tabby, modelled on the reference art and
// animated purely with CSS. Shapes are limited to path/ellipse/circle/rect so
// the click-through hit-test (pet.css: `.pet-cat path, ellipse, circle, rect {
// pointer-events: auto }`) covers every painted pixel. `status` drives which
// animation/overlay is active.
const ORANGE = "#F5A23B"
const ORANGE_DARK = "#E0892C"
const STRIPE = "#C9742A"
const CREAM = "#FBEAD2"
const EAR_INNER = "#F5C9A1"
const EYE = "#2A7A47"
const EYE_PUPIL = "#0C2113"
const NOSE = "#EE8FA2"
const MOUTH = "#B0662A"
const CHEEK = "#F3A89F"
const WHISKER = "#D8B58C"
const PAW = "#F4A89E"

export const Cat: Component<{ status: PetSessionStatus }> = (props) => {
  return (
    <svg class="pet-cat" data-status={props.status} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      {/* body — a compact rounded torso (kept smaller than the head for a chibi look) */}
      <ellipse cx="60" cy="87" rx="35" ry="28" fill={ORANGE} />

      {/* belly patch — a rounded cream oval with clear orange showing around it */}
      <ellipse cx="60" cy="95" rx="23" ry="17.5" fill={CREAM} />

      {/* back feet — small, round cream pads with pink beans, spread at the bottom */}
      <ellipse cx="45" cy="110" rx="9" ry="8.5" fill={CREAM} />
      <ellipse cx="75" cy="110" rx="9" ry="8.5" fill={CREAM} />
      <ellipse cx="45" cy="111" rx="3.8" ry="2.6" fill={PAW} />
      <circle cx="41.5" cy="107" r="1.4" fill={PAW} />
      <circle cx="45" cy="106" r="1.5" fill={PAW} />
      <circle cx="48.5" cy="107" r="1.4" fill={PAW} />
      <ellipse cx="75" cy="111" rx="3.8" ry="2.6" fill={PAW} />
      <circle cx="71.5" cy="107" r="1.4" fill={PAW} />
      <circle cx="75" cy="106" r="1.5" fill={PAW} />
      <circle cx="78.5" cy="107" r="1.4" fill={PAW} />

      {/* front paws — long, slim arms tucked under the cheeks at the belly's
          upper sides, slanting diagonally inward as they droop down onto it */}
      <g transform="translate(36 89) rotate(-22)">
        <ellipse cx="0" cy="0" rx="7" ry="12" fill={ORANGE} />
        <path d="M-4.5 7 q4.5 3 9 0" stroke={ORANGE_DARK} stroke-width="1.4" fill="none" stroke-linecap="round" />
      </g>
      <g transform="translate(84 89) rotate(22)">
        <ellipse cx="0" cy="0" rx="7" ry="12" fill={ORANGE} />
        <path d="M-4.5 7 q4.5 3 9 0" stroke={ORANGE_DARK} stroke-width="1.4" fill="none" stroke-linecap="round" />
      </g>

      {/* head group — bobs gently */}
      <g class="pet-cat__head">
        {/* ears — rounded-corner triangles on the head's top corners */}
        <g class="pet-cat__ears">
          <path d="M27 36 L33 4 L52 26 Z" fill={ORANGE} stroke={ORANGE} stroke-width="5" stroke-linejoin="round" />
          <path d="M33 30 L37 15 L47 26 Z" fill={EAR_INNER} stroke={EAR_INNER} stroke-width="3" stroke-linejoin="round" />
          <path d="M93 36 L87 4 L68 26 Z" fill={ORANGE} stroke={ORANGE} stroke-width="5" stroke-linejoin="round" />
          <path d="M87 30 L83 15 L73 26 Z" fill={EAR_INNER} stroke={EAR_INNER} stroke-width="3" stroke-linejoin="round" />
        </g>

        {/* head — a flat (wider-than-tall) ellipse */}
        <ellipse cx="60" cy="46" rx="41" ry="32" fill={ORANGE} />

        {/* forehead tabby stripes */}
        <path d="M49 18 q-2 7 -1 13" stroke={STRIPE} stroke-width="3.4" fill="none" stroke-linecap="round" />
        <path d="M56 16 q-1 8 0 15" stroke={STRIPE} stroke-width="3.4" fill="none" stroke-linecap="round" />
        <path d="M64 16 q1 8 0 15" stroke={STRIPE} stroke-width="3.4" fill="none" stroke-linecap="round" />
        <path d="M71 18 q2 7 1 13" stroke={STRIPE} stroke-width="3.4" fill="none" stroke-linecap="round" />

        {/* cream face patch — sits low so the eyes straddle the orange forehead */}
        <ellipse cx="60" cy="59" rx="30" ry="18" fill={CREAM} />

        {/* cheeks / dimples (outer) */}
        <ellipse cx="39" cy="60" rx="5.5" ry="3.8" fill={CHEEK} />
        <ellipse cx="81" cy="60" rx="5.5" ry="3.8" fill={CHEEK} />

        {/* eyes — cream socket + green iris + dark pupil + glossy highlights; set high so
            their tops overlap the orange forehead. Each eye blinks (scaleY) as a group. */}
        <g class="pet-cat__eyes">
          <ellipse cx="45" cy="45" rx="9.5" ry="9.5" fill={CREAM} />
          <ellipse cx="75" cy="45" rx="9.5" ry="9.5" fill={CREAM} />
          <g class="pet-cat__eye">
            <circle cx="45" cy="45" r="7.5" fill={EYE} />
            <ellipse cx="45" cy="45.5" rx="4.3" ry="4.8" fill={EYE_PUPIL} />
            <circle cx="42.3" cy="42.3" r="2.6" fill="#FFFFFF" />
            <circle cx="47.5" cy="48" r="1.3" fill="#FFFFFF" />
          </g>
          <g class="pet-cat__eye">
            <circle cx="75" cy="45" r="7.5" fill={EYE} />
            <ellipse cx="75" cy="45.5" rx="4.3" ry="4.8" fill={EYE_PUPIL} />
            <circle cx="72.3" cy="42.3" r="2.6" fill="#FFFFFF" />
            <circle cx="77.5" cy="48" r="1.3" fill="#FFFFFF" />
          </g>
        </g>

        {/* nose + mouth — sits a touch higher on the face */}
        <path d="M55.5 53.5 Q60 52.5 64.5 53.5 Q61.5 58.5 60 58.5 Q58.5 58.5 55.5 53.5 Z" fill={NOSE} />
        <path
          d="M60 60 q-4.5 5 -9 1.5 M60 60 q4.5 5 9 1.5"
          stroke={MOUTH}
          stroke-width="1.7"
          fill="none"
          stroke-linecap="round"
        />

        {/* whiskers */}
        <g stroke={WHISKER} stroke-width="1.5" fill="none" stroke-linecap="round">
          <path d="M33 56 Q20 54 8 57" />
          <path d="M33 61 L7 62" />
          <path d="M33 66 Q20 68 9 71" />
          <path d="M87 56 Q100 54 112 57" />
          <path d="M87 61 L113 62" />
          <path d="M87 66 Q100 68 111 71" />
        </g>
      </g>

      {/* tail — an even-width orange sweep curving out to the right and up, tip
          relaxed (uncurled); drawn as a constant-thickness stroke. Sways (faster while busy) */}
      <g class="pet-cat__tail">
        <path
          d="M92 91 C104 96 113 91 114 79"
          stroke={ORANGE}
          stroke-width="12"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>

      {/* busy: thinking dots */}
      <g class="pet-cat__think">
        <circle class="pet-cat__dot" cx="98" cy="22" r="3" fill="#5B5048" />
        <circle class="pet-cat__dot" cx="107" cy="16" r="3.5" fill="#5B5048" />
        <circle class="pet-cat__dot" cx="116" cy="9" r="4" fill="#5B5048" />
      </g>

      {/* retry / needs-attention: exclamation */}
      <g class="pet-cat__alert">
        <circle cx="101" cy="16" r="12.5" fill="#F4B740" />
        <rect x="98.5" y="7.5" width="5" height="11" rx="2.5" fill="#3A2A12" />
        <circle cx="101" cy="22" r="2.6" fill="#3A2A12" />
      </g>
    </svg>
  )
}
