import type { Component } from "solid-js"
import type { PetSessionStatus } from "@opencode-ai/app/pet"

// 大橘猫 — a single hand-drawn orange tabby, animated purely with CSS. The
// `status` drives which animation/overlay is active (see pet.css).
export const Cat: Component<{ status: PetSessionStatus }> = (props) => {
  return (
    <svg class="pet-cat" data-status={props.status} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      {/* tail — sways; faster while busy */}
      <g class="pet-cat__tail">
        <path
          d="M94 86 C112 84 114 64 104 56 C100 52 93 54 94 61 C95 70 100 76 88 80 Z"
          fill="#E8862B"
        />
        <path d="M104 56 C108 59 109 65 106 70" stroke="#C96E1B" stroke-width="2" fill="none" stroke-linecap="round" />
      </g>

      {/* body */}
      <ellipse cx="60" cy="92" rx="34" ry="26" fill="#F4A23E" />
      <ellipse cx="60" cy="98" rx="20" ry="16" fill="#FBE8D2" />
      {/* body stripes */}
      <path d="M40 80 q6 6 4 16" stroke="#E07C1E" stroke-width="3" fill="none" stroke-linecap="round" />
      <path d="M80 80 q-6 6 -4 16" stroke="#E07C1E" stroke-width="3" fill="none" stroke-linecap="round" />
      {/* paws */}
      <ellipse cx="48" cy="114" rx="9" ry="6" fill="#FBE8D2" />
      <ellipse cx="72" cy="114" rx="9" ry="6" fill="#FBE8D2" />

      {/* head group */}
      <g class="pet-cat__head">
        {/* ears */}
        <g class="pet-cat__ears">
          <path d="M30 36 L26 14 L48 28 Z" fill="#F4A23E" />
          <path d="M33 31 L31 20 L42 27 Z" fill="#F7B98A" />
          <path d="M90 36 L94 14 L72 28 Z" fill="#F4A23E" />
          <path d="M87 31 L89 20 L78 27 Z" fill="#F7B98A" />
        </g>

        {/* face */}
        <ellipse cx="60" cy="50" rx="34" ry="30" fill="#F4A23E" />
        {/* forehead stripes */}
        <path d="M54 22 l-3 14" stroke="#E07C1E" stroke-width="3" fill="none" stroke-linecap="round" />
        <path d="M60 21 l0 14" stroke="#E07C1E" stroke-width="3" fill="none" stroke-linecap="round" />
        <path d="M66 22 l3 14" stroke="#E07C1E" stroke-width="3" fill="none" stroke-linecap="round" />
        {/* cheeks / muzzle */}
        <ellipse cx="60" cy="60" rx="22" ry="16" fill="#FBE8D2" />

        {/* eyes — blink via scaleY */}
        <g class="pet-cat__eyes">
          <ellipse class="pet-cat__eye" cx="48" cy="50" rx="6.5" ry="8" fill="#3B7D4F" />
          <ellipse class="pet-cat__eye" cx="72" cy="50" rx="6.5" ry="8" fill="#3B7D4F" />
          <circle cx="48" cy="50" r="3" fill="#16321F" />
          <circle cx="72" cy="50" r="3" fill="#16321F" />
          <circle cx="49.5" cy="48" r="1.3" fill="#FFFFFF" />
          <circle cx="73.5" cy="48" r="1.3" fill="#FFFFFF" />
        </g>

        {/* nose + mouth */}
        <path d="M57 60 L63 60 L60 64 Z" fill="#E8728A" />
        <path d="M60 64 q-4 4 -8 2 M60 64 q4 4 8 2" stroke="#C96E1B" stroke-width="1.6" fill="none" stroke-linecap="round" />

        {/* whiskers */}
        <g stroke="#D9B38C" stroke-width="1.4" stroke-linecap="round">
          <path d="M40 58 L22 54" />
          <path d="M40 62 L23 63" />
          <path d="M80 58 L98 54" />
          <path d="M80 62 L97 63" />
        </g>
      </g>

      {/* busy: thinking dots */}
      <g class="pet-cat__think">
        <circle class="pet-cat__dot" cx="96" cy="26" r="3" fill="#5B5048" />
        <circle class="pet-cat__dot" cx="105" cy="20" r="3.5" fill="#5B5048" />
        <circle class="pet-cat__dot" cx="115" cy="13" r="4" fill="#5B5048" />
      </g>

      {/* retry / needs-attention: exclamation */}
      <g class="pet-cat__alert">
        <circle cx="100" cy="20" r="13" fill="#F4B740" />
        <rect x="97.5" y="11" width="5" height="11" rx="2.5" fill="#3A2A12" />
        <circle cx="100" cy="26" r="2.6" fill="#3A2A12" />
      </g>
    </svg>
  )
}
