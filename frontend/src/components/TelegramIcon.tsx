import React from "react";

interface TelegramIconProps {
  className?: string;
  size?: number;
}

export default function TelegramIcon({
  className = "w-4 h-4",
  size = 16,
}: TelegramIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        d="M5.4 11.95L17.5 7.1C18.06 6.87 18.55 7.21 18.37 7.95L16.31 17.65C16.16 18.33 15.75 18.5 15.18 18.18L12.04 15.86L10.52 17.32C10.35 17.49 10.21 17.63 9.89 17.63L10.12 14.47L15.87 9.27C16.12 9.05 15.82 8.93 15.49 9.15L8.38 13.63L5.32 12.67C4.66 12.46 4.64 12.01 5.4 11.95Z"
        fill="white"
      />
    </svg>
  );
}
