import { html, type TemplateResult } from "lit-html";
import { type Action, Action as AppAction } from "../../app/action";
import { type Control, Controls } from "../../app/control";
import type { DesignStudioInteraction } from "../../design-studio/interaction/interaction";
import { type LitTemplate, nothing } from "../../presentation/lit-template";
import type { Position } from "../../world/components";
import type { World } from "../../world/world";

type Dispatch = (action: Action) => void;

const touchButtonClass =
	"inline-flex min-h-12 min-w-12 select-none items-center justify-center rounded-2xl border border-[#e8b875]/65 bg-[#0d181f]/88 font-heading text-[0.7rem] font-bold tracking-[0.06em] text-[#fff1d6] shadow-[0_0.5rem_1.5rem_rgb(0_0_0/28%)] max-[380px]:min-h-11 max-[380px]:min-w-[2.6rem] [-webkit-touch-callout:none]";
const touchButtonActiveClass =
	"active:translate-y-px active:scale-[0.97] active:border-[#fff0a8] active:bg-[#44574d]/96";

const controlButton = ({
	control,
	label,
	visibleLabel,
	visibleLabelClass = "",
	className = "",
	dispatch,
}: {
	readonly control: Control;
	readonly label: string;
	readonly visibleLabel: string;
	readonly visibleLabelClass?: string;
	readonly className?: string;
	readonly dispatch: Dispatch;
}): TemplateResult => {
	const changeControl = (event: PointerEvent, pressed: boolean): void => {
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		if (pressed) {
			if (target.dataset["controlPointer"] !== undefined) return;
			target.dataset["controlPointer"] = String(event.pointerId);
			target.setPointerCapture(event.pointerId);
		} else {
			if (target.dataset["controlPointer"] !== String(event.pointerId)) return;
			delete target.dataset["controlPointer"];
		}
		event.preventDefault();
		dispatch(AppAction.KeyChanged({ key: control, pressed }));
	};
	return html`
		<button
			type="button"
			class=${`${touchButtonClass} ${touchButtonActiveClass} ${className}`}
			aria-label=${label}
			@pointerdown=${(event: PointerEvent) => changeControl(event, true)}
			@pointerup=${(event: PointerEvent) => changeControl(event, false)}
			@pointercancel=${(event: PointerEvent) => changeControl(event, false)}
			@lostpointercapture=${(event: PointerEvent) =>
				changeControl(event, false)}
			@contextmenu=${(event: Event) => event.preventDefault()}
		>
			<span class=${visibleLabelClass}>${visibleLabel}</span>
		</button>
	`;
};

const actionButton = ({
	label,
	onClick,
	className = "",
	disabled = false,
}: {
	readonly label: string;
	readonly onClick: () => void;
	readonly className?: string;
	readonly disabled?: boolean;
}): TemplateResult => {
	const finishPointer = (event: PointerEvent, completed: boolean): void => {
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		event.stopPropagation();
		if (target.dataset["actionPointer"] !== String(event.pointerId)) return;
		delete target.dataset["actionPointer"];
		if (completed) target.dataset["actionCompleted"] = "true";
	};
	const activeClass = disabled ? "" : touchButtonActiveClass;
	return html`
		<button
			type="button"
			class=${`${touchButtonClass} ${activeClass} touch-none px-4 disabled:opacity-45 ${className}`}
			?disabled=${disabled}
			@pointerdown=${(event: PointerEvent) => {
				if (disabled) return;
				const target = event.currentTarget;
				if (!(target instanceof HTMLElement)) return;
				event.stopPropagation();
				if (target.dataset["actionPointer"] !== undefined) return;
				delete target.dataset["actionCompleted"];
				delete target.dataset["actionCancelled"];
				target.dataset["actionPointer"] = String(event.pointerId);
				target.setPointerCapture(event.pointerId);
			}}
			@pointermove=${(event: PointerEvent) => {
				event.preventDefault();
				event.stopPropagation();
			}}
			@pointerup=${(event: PointerEvent) => finishPointer(event, true)}
			@pointercancel=${(event: PointerEvent) => {
				const target = event.currentTarget;
				if (target instanceof HTMLElement)
					target.dataset["actionCancelled"] = "true";
				finishPointer(event, false);
			}}
			@lostpointercapture=${(event: PointerEvent) =>
				finishPointer(event, false)}
			@click=${(event: MouseEvent) => {
				if (disabled) return;
				if (event.detail === 0) {
					onClick();
					return;
				}
				const target = event.currentTarget;
				if (!(target instanceof HTMLElement)) return;
				const cancelled = target.dataset["actionCancelled"] === "true";
				delete target.dataset["actionCompleted"];
				delete target.dataset["actionCancelled"];
				if (!cancelled) onClick();
				event.preventDefault();
				event.stopPropagation();
			}}
			@contextmenu=${(event: Event) => event.preventDefault()}
		>${label}</button>
	`;
};

const joystickTemplate = (
	onChange: (input: {
		readonly pointerId: number;
		readonly vector: Position | null;
	}) => void,
): TemplateResult => {
	const ownsPointer = (target: HTMLElement, pointerId: number): boolean =>
		target.dataset["joystickPointer"] === String(pointerId);
	const update = (event: PointerEvent): void => {
		event.preventDefault();
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const bounds = target.getBoundingClientRect();
		const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2 - 28);
		const x = event.clientX - (bounds.left + bounds.width / 2);
		const y = event.clientY - (bounds.top + bounds.height / 2);
		const distance = Math.hypot(x, y);
		const scale = distance > radius ? radius / distance : 1;
		const visualX = x * scale;
		const visualY = y * scale;
		target.style.setProperty("--joystick-x", `${visualX}px`);
		target.style.setProperty("--joystick-y", `${visualY}px`);
		onChange({
			pointerId: event.pointerId,
			vector: { x: visualX / radius, y: visualY / radius },
		});
	};
	const release = (event: PointerEvent): void => {
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		if (!ownsPointer(target, event.pointerId)) return;
		delete target.dataset["joystickPointer"];
		event.preventDefault();
		target.style.setProperty("--joystick-x", "0px");
		target.style.setProperty("--joystick-y", "0px");
		onChange({ pointerId: event.pointerId, vector: null });
	};
	return html`
		<div
			role="application"
			aria-label="Movement joystick"
			class="pointer-events-auto relative size-32 shrink-0 touch-none select-none rounded-full border-2 border-[#e8b875]/55 bg-[#0d181f]/78 shadow-[0_0.75rem_2rem_rgb(0_0_0/32%)] max-[380px]:size-28 landscape:size-24"
			style="--joystick-x: 0px; --joystick-y: 0px;"
			@pointerdown=${(event: PointerEvent) => {
				const target = event.currentTarget;
				if (!(target instanceof HTMLElement)) return;
				if (target.dataset["joystickPointer"] !== undefined) return;
				target.dataset["joystickPointer"] = String(event.pointerId);
				target.setPointerCapture(event.pointerId);
				update(event);
			}}
			@pointermove=${(event: PointerEvent) => {
				const target = event.currentTarget;
				if (
					target instanceof HTMLElement &&
					ownsPointer(target, event.pointerId) &&
					target.hasPointerCapture(event.pointerId)
				)
					update(event);
			}}
			@pointerup=${release}
			@pointercancel=${release}
			@lostpointercapture=${release}
			@contextmenu=${(event: Event) => event.preventDefault()}
		>
			<div class="pointer-events-none absolute top-1/2 left-1/2 size-15 rounded-full border border-[#fff0a8]/75 bg-[#5d4528] shadow-lg [transform:translate(calc(-50%+var(--joystick-x)),calc(-50%+var(--joystick-y)))]"></div>
		</div>
	`;
};

const changeGameplayJoystick = (vector: Position, dispatch: Dispatch): void => {
	const threshold = 0.24;
	dispatch(
		AppAction.KeyChanged({
			key: Controls.Left,
			pressed: vector.x < -threshold,
		}),
	);
	dispatch(
		AppAction.KeyChanged({
			key: Controls.Right,
			pressed: vector.x > threshold,
		}),
	);
	dispatch(
		AppAction.KeyChanged({ key: Controls.Up, pressed: vector.y < -threshold }),
	);
	dispatch(
		AppAction.KeyChanged({ key: Controls.Down, pressed: vector.y > threshold }),
	);
};

export const mobileControlsTemplate = ({
	world,
	interaction,
	dispatch,
}: {
	readonly world: World;
	readonly interaction: DesignStudioInteraction;
	readonly dispatch: Dispatch;
}): LitTemplate => {
	const editing = world.editor.open;
	if (
		editing &&
		(interaction.isTouchPanelOpen() || interaction.isTouchDetailsOpen())
	)
		return nothing;
	let actionControls: LitTemplate = nothing;
	if (editing) {
		const selected = world.editor.selected;
		const hasSelection = selected !== null;
		const canToggleSelectionMode =
			selected !== null &&
			selected !== "floor" &&
			!world.characters.has(selected);
		const canFinish = hasSelection || world.editor.editSession !== null;
		const modeLabel =
			interaction.touchEditorMode() === "move" ? "RESIZE" : "MOVE";
		actionControls = html`
			${actionButton({ label: "DONE", onClick: interaction.finishTouchInteraction, disabled: !canFinish, className: "min-h-14 border-[#9a625d] bg-[#6f3f3e]/94" })}
			${actionButton({ label: "DETAILS", onClick: interaction.openTouchDetails, disabled: !hasSelection, className: "min-h-14 border-[#e8b875] bg-[#5d4528]/94" })}
			${actionButton({ label: modeLabel, onClick: interaction.toggleTouchEditorMode, disabled: !canToggleSelectionMode, className: "col-span-2 min-h-12 border-[#638390] bg-[#294b57]/94" })}
		`;
	}
	if (!editing) {
		actionControls = html`
			${controlButton({ control: Controls.ContextAction, label: "Grab or interact", visibleLabel: "B", visibleLabelClass: "text-2xl leading-none", className: "absolute bottom-0 left-0 aspect-square size-16 rounded-full p-0", dispatch })}
			${controlButton({ control: Controls.Jump, label: "Jump", visibleLabel: "A", visibleLabelClass: "text-2xl leading-none", className: "absolute top-0 right-0 aspect-square size-16 rounded-full bg-[#5d4528]/92 p-0", dispatch })}
		`;
	}
	const actionLayoutClass = editing
		? "grid grid-cols-2 items-end gap-3 max-[380px]:gap-2"
		: "relative h-30 w-38 landscape:h-27 landscape:w-35";
	return html`
		<div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-end justify-between gap-5 px-[max(0.875rem,env(safe-area-inset-left))] pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1.5rem))] any-pointer-coarse:flex landscape:px-[max(0.75rem,env(safe-area-inset-left))] landscape:pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-label="Touch controls">
			${joystickTemplate(({ pointerId, vector }) => {
				if (editing) {
					interaction.updateTouchJoystick({ pointerId, vector });
					return;
				}
				changeGameplayJoystick(vector ?? { x: 0, y: 0 }, dispatch);
			})}
			<div class=${`pointer-events-auto shrink-0 touch-none ${actionLayoutClass}`} aria-label="Action controls">
				${actionControls}
			</div>
		</div>
	`;
};
