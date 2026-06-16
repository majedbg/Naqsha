// Base node for the scene graph. Every drawable in the studio is (or will be) a
// SceneNode: today's patterns via PatternNode, and the upcoming TextNode. The
// `transform` is the shared seam interactive nodes use; patterns default to
// identity and ignore it, so introducing this changes no existing behavior.

export const IDENTITY_TRANSFORM = Object.freeze({ x: 0, y: 0, rotation: 0, scale: 1 });

export class SceneNode {
  constructor({ id, type, transform, visible = true } = {}) {
    this.id = id;
    this.type = type;
    this.transform = { ...IDENTITY_TRANSFORM, ...(transform || {}) };
    this.visible = visible;
  }

  /** Subclasses MUST override. Returns the `<g>…</g>` SVG string for this node. */
  toSVGGroup() {
    throw new Error('SceneNode subclass must implement toSVGGroup()');
  }

  /** Serializable metadata (no live instances). Subclasses extend this. */
  serialize() {
    return { id: this.id, type: this.type, transform: { ...this.transform }, visible: this.visible };
  }
}
