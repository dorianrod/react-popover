import * as React from "react"
import * as Forto from "forto"
import * as Pop from "popmotion"
import * as Tip from "./tip"
import * as F from "./utils"

interface Subscription {
  closed: boolean
  unsubscribe(): void
}

// TODO Support ref, outerAction will need it
interface Props {
  target: Element
  body: React.ReactNode
  refreshIntervalMs: null | number
  place: Forto.Settings.Order | Forto.Settings.Ori.Side | Forto.Settings.Ori.Ori
  preferPlace:
    | Forto.Settings.Order
    | Forto.Settings.Ori.Side
    | Forto.Settings.Ori.Ori
  pose?: "exit"
  onPoseComplete: Function
}

class FortoPop extends React.Component<Props, {}> {
  static defaultProps = {
    onPoseComplete: F.noop,
  }
  layout: null | Forto.Calculation = null
  popoverRef = React.createRef<HTMLDivElement>()
  layoutsSubscription: null | Subscription = null
  popoverReaction: null | Pop.ValueReaction = null

  render() {
    return (
      <div ref={this.popoverRef} style={{ position: "absolute" }}>
        <div className="Popover-body" children={this.props.body} />
        {/* <Tip.Component width={tipShape.width} height={tipShape.height} /> */}
        <Tip.Component width={8} height={8} />
      </div>
    )
  }

  componentDidMount() {
    const arrangement = {
      // TODO is this .current safe?
      target: this.props.target!,
      frame: window,
      tip: this.popoverRef.current!.querySelector(".Popover-tip")!,
      popover: this.popoverRef.current!.querySelector(".Popover-body")!,
    }

    const popoverStyle = Pop.styler(this.popoverRef.current!, {})
    const tipStyle = Pop.styler(arrangement.tip, {})

    const popoverReaction = Pop.value({ x: 0, y: 5, opacity: 0 })
    popoverReaction.subscribe(popoverStyle.set)

    const layouts = Forto.DOM.observeWithPolling(
      {
        elligibleZones: this.props.place,
        preferredZones: this.props.preferPlace,
      },
      arrangement,
      this.props.refreshIntervalMs || 1000,
    )

    this.popoverReaction = popoverReaction
    this.layoutsSubscription = layouts.subscribe(
      (newLayout: Forto.Calculation) => {
        Tip.updateElementShape(
          arrangement.tip!,
          // Tip.calcShape(this.props.tipSize, newLayout.zone.side),
          Tip.calcShape(8, newLayout.zone.side),
        )

        if (!this.layout) {
          this.layout = newLayout
          // TODO: Create issue with Forto, we need a better DSL :)
          popoverReaction.update({
            ...(popoverReaction.get() as any),
            [Forto.Ori.crossAxis(Forto.Ori.fromSide(newLayout.zone))]: newLayout
              .popover[Forto.Ori.crossAxis(Forto.Ori.fromSide(newLayout.zone))],
            [Forto.Ori.mainAxis(Forto.Ori.fromSide(newLayout.zone))]:
              newLayout.popover[
                Forto.Ori.mainAxis(Forto.Ori.fromSide(newLayout.zone))
              ] +
              15 *
                (newLayout.zone.side === Forto.Ori.Side.Top ||
                newLayout.zone.side === Forto.Ori.Side.Left
                  ? -1
                  : 1),
          })
          popoverReaction.velocityCheck({ timestamp: 0, delta: 0 })
        }

        Pop.spring({
          from: popoverReaction.get(),
          to: { ...newLayout.popover, opacity: 1 },
          velocity: this.layout ? popoverReaction.getVelocity() : 0,
          stiffness: 450,
          damping: 35,
          mass: 1.5,
        }).start(popoverReaction)

        tipStyle.set(newLayout.tip!)
      },
    )
  }

  // TODO during exit animation it should be possible to interrupt
  // and bring back the popover. To see it not doing this right now
  // set a high exit tween duration and spam click toggle.
  componentDidUpdate(prevProps: Props) {
    if (
      this.layout &&
      this.popoverReaction &&
      prevProps.pose !== this.props.pose &&
      this.props.pose === "exit"
    ) {
      this.layoutsSubscription!.unsubscribe()

      // TODO When exiting after a recent animation it animates to a
      // weird XY as if current XY is a lag
      // TODO better DSL from forto
      const newXY = {
        [Forto.Ori.crossAxis(Forto.Ori.fromSide(this.layout.zone))]: this.layout
          .popover[Forto.Ori.crossAxis(Forto.Ori.fromSide(this.layout.zone))],
        [Forto.Ori.mainAxis(Forto.Ori.fromSide(this.layout.zone))]:
          this.layout.popover[
            Forto.Ori.mainAxis(Forto.Ori.fromSide(this.layout.zone))
          ] +
          // TODO this should be same as enter size
          -20 *
            // TODO orientation check instead of side check
            (this.layout.zone.side === Forto.Ori.Side.Top ||
            this.layout.zone.side === Forto.Ori.Side.Left
              ? 1
              : -1),
      }

      Pop.tween({
        from: this.popoverReaction.get(),
        to: { ...newXY, opacity: 0 },
        duration: 2000,
        // velocity: 0,
        // stiffness: 450,
        // damping: 35,
        // mass: 1.5,
      }).start({
        update: (value: { opacity: number }) =>
          this.popoverReaction!.update(value),
        complete: this.props.onPoseComplete as any,
      })
    }
  }

  componentWillUnmount() {
    if (this.layoutsSubscription) {
      this.layoutsSubscription.unsubscribe()
    }
    if (this.popoverReaction) {
      this.popoverReaction.stop()
    }
  }
}

export default FortoPop
export { FortoPop as Component, Props }
