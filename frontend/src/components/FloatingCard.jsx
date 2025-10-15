const TITLE_ACCENT_CLASS = "font-semibold uppercase tracking-[0.35em] text-amber-500";
const BODY_TEXT_LIGHT = "text-slate-600";
const BODY_TEXT_DARK = "text-slate-200";

export default function FloatingCard({
  title,
  titleSize = "text-xl",
  titleWeight = "font-semibold",
  titleClassName,
  body,
  bodySize = "text-sm",
  bodyClassName,
  bodyAfterChildren = false,
  tone = "light",
  padding = "p-6",
  className = "",
  children,
  childrenClassName,
  wrapChildren = true,
}) {
  const baseTone =
    tone === "dark"
      ? "bg-slate-900/70 text-slate-100 shadow-[0_28px_80px_-48px rgba(15,23,42,0.6)]"
      : "bg-white/90 text-slate-900 shadow-[0_26px_70px_-42px rgba(15,23,42,0.25)]";

  const paddingClass = padding ? padding : "";
  const rootClassName = [
    "rounded-[28px] backdrop-blur transition-shadow duration-300",
    baseTone,
    paddingClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const resolvedTitleClass = titleClassName ?? TITLE_ACCENT_CLASS;

  const computedTitleClass =
    [titleSize, titleWeight, resolvedTitleClass]
      .filter(Boolean)
      .join(" ");

  const computedBodyClass =
    [
      bodySize,
      tone === "dark" ? BODY_TEXT_DARK : BODY_TEXT_LIGHT,
      bodyClassName,
    ]
      .filter(Boolean)
      .join(" ");

  const bodyMarginClass = bodyAfterChildren
    ? children
      ? "mt-4"
      : title
        ? "mt-4"
        : ""
    : title
      ? "mt-2"
      : "";

  const bodyElement =
    body
      ? <p className={[computedBodyClass, bodyMarginClass].filter(Boolean).join(" ")}>{body}</p>
      : null;

  const computedChildrenWrapper =
    childrenClassName ?? ((title || (!bodyAfterChildren && body)) ? "mt-6" : "mt-4");

  return (
    <div className={rootClassName}>
      {title ? <h2 className={computedTitleClass}>{title}</h2> : null}
      {!bodyAfterChildren ? bodyElement : null}
      {children
        ? wrapChildren
          ? <div className={computedChildrenWrapper}>{children}</div>
          : children
        : null}
      {bodyAfterChildren ? bodyElement : null}
    </div>
  );
}
