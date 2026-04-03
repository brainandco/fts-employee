"use client";

type Props = {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function initialsFrom(name: string, email?: string | null) {
  const s = name?.trim() || email?.trim() || "?";
  return s
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

const sizeClass = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-24 w-24 text-2xl",
};

export function UserAvatar({ name, email, avatarUrl, size = "md", className = "" }: Props) {
  const initials = initialsFrom(name, email);
  const sc = sizeClass[size];
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`${sc} shrink-0 rounded-full object-cover ring-2 ring-white/20 ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white shadow-lg shadow-indigo-900/30 ${sc} ${className}`}
      aria-hidden
    >
      {initials}
    </div>
  );
}
