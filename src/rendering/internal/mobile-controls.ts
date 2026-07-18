import { html, type TemplateResult } from "lit-html";
import { type Action, Action as AppAction } from "../../app/action";
import { type Control, Controls } from "../../app/control";

type Dispatch = (action: Action) => void;

const controlButton = ({
	control,
	label,
	visibleLabel,
	className = "",
	dispatch,
}: {
	readonly control: Control;
	readonly label: string;
	readonly visibleLabel: string;
	readonly className?: string;
	readonly dispatch: Dispatch;
}): TemplateResult => {
	const changeControl = (event: PointerEvent, pressed: boolean): void => {
		event.preventDefault();
		if (pressed) {
			const target = event.currentTarget;
			if (target instanceof Element) target.setPointerCapture(event.pointerId);
		}
		dispatch(AppAction.KeyChanged({ key: control, pressed }));
	};
	return html`
		<button
			type="button"
			class=${`inline-flex min-h-12 min-w-12 select-none items-center justify-center rounded-2xl border border-[#e8b875]/65 bg-[#0d181f]/88 font-heading text-base font-bold tracking-[0.06em] text-[#fff1d6] shadow-[0_0.5rem_1.5rem_rgb(0_0_0/28%)] active:translate-y-px active:scale-[0.97] active:border-[#fff0a8] active:bg-[#44574d]/96 max-[380px]:min-h-11 max-[380px]:min-w-[2.6rem] max-[380px]:rounded-[0.85rem] [-webkit-touch-callout:none] ${className}`}
			aria-label=${label}
			@pointerdown=${(event: PointerEvent) => changeControl(event, true)}
			@pointerup=${(event: PointerEvent) => changeControl(event, false)}
			@pointercancel=${(event: PointerEvent) => changeControl(event, false)}
			@lostpointercapture=${(event: PointerEvent) =>
				changeControl(event, false)}
			@contextmenu=${(event: Event) => event.preventDefault()}
		>
			${visibleLabel}
		</button>
	`;
};

export const mobileControlsTemplate = (dispatch: Dispatch): TemplateResult =>
	html`
		<div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-end justify-between gap-5 px-[max(0.875rem,env(safe-area-inset-left))] pb-[max(0.875rem,env(safe-area-inset-bottom))] max-md:flex max-[380px]:gap-3 [@media(max-width:900px)_and_(max-height:500px)]:flex pointer-coarse:flex" aria-label="Touch controls">
			<div class="pointer-events-auto grid w-40 shrink-0 touch-none grid-cols-3 grid-rows-2 gap-2 max-[380px]:w-34 max-[380px]:gap-1.5" aria-label="Movement controls">
				${controlButton({ control: Controls.Up, label: "Move up", visibleLabel: "▲", className: "col-start-2", dispatch })}
				${controlButton({ control: Controls.Left, label: "Move left", visibleLabel: "◀", className: "col-start-1 row-start-2", dispatch })}
				${controlButton({ control: Controls.Down, label: "Move down", visibleLabel: "▼", className: "col-start-2 row-start-2", dispatch })}
				${controlButton({ control: Controls.Right, label: "Move right", visibleLabel: "▶", className: "col-start-3 row-start-2", dispatch })}
			</div>
			<div class="pointer-events-auto grid shrink-0 touch-none grid-cols-2 items-end gap-2 max-[380px]:gap-1.5" aria-label="Action controls">
				${controlButton({ control: Controls.Grab, label: "Hold to grab or drag", visibleLabel: "GRAB", className: "text-[0.65rem]", dispatch })}
				${controlButton({ control: Controls.Interact, label: "Interact", visibleLabel: "ACT", className: "text-[0.65rem]", dispatch })}
				${controlButton({ control: Controls.Jump, label: "Jump", visibleLabel: "JUMP", className: "col-span-2 min-h-[3.35rem] bg-[#5d4528]/92 text-[0.72rem]", dispatch })}
			</div>
		</div>
	`;
