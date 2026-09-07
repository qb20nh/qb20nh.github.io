import assert from "node:assert/strict";
import test from "node:test";
import { setupCardPreview } from "../src/app/card-preview.js";

for (const stage of ["before mount", "after mount", "after release"]) {
  test(`tab changes preserve the viewer iframe ${stage}`, (t) => {
    const fixture = createFixture(t);
    fixture.startPreview();
    const transition = fixture.prepareTransition();
    assert.equal(transition.hasLoadedPreviewFrame, true);
    if (stage !== "before mount") transition.mountLoadedFrame();
    if (stage === "after release") transition.release({ keepFrame: true });

    const { frame, preview, document } = fixture;
    const parent = frame.parentElement;
    const contentWindow = frame.contentWindow;
    const navigations = frame.navigations.length;
    contentWindow.progress = "in-progress game";

    for (const visibilityState of ["hidden", "visible", "hidden", "visible"]) {
      document.visibilityState = visibilityState;
      document.hidden = visibilityState === "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      assert.equal(frame.hidden, false);
      assert.equal(frame.parentElement, parent);
      assert.equal(frame.contentWindow, contentWindow);
      assert.equal(frame.contentWindow.progress, "in-progress game");
      assert.equal(frame.navigations.length, navigations);
    }

    // Explicit preview cleanup must honor the same handoff as tab cleanup.
    preview.stopAll();
    assert.equal(frame.navigations.length, navigations);
    assert.equal(frame.hidden, false);
  });
}

for (const state of ["active", "fading", "pending"]) {
  test(`hidden tabs still clean up ${state} card previews`, (t) => {
    const fixture = createFixture(t);
    const { preview, card, directory, frame, document } = fixture;
    if (state === "pending") preview.previewCard(card);
    else fixture.startPreview();
    if (state === "fading") {
      const event = new Event("pointerout");
      Object.assign(event, { pointerType: "mouse", relatedTarget: null });
      Object.defineProperty(event, "target", { value: card });
      directory.dispatchEvent(event);
    }
    document.visibilityState = "hidden";
    document.hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    fixture.flushTimers();
    assert.equal(card.classList.contains("is-previewing"), false);
    if (state === "pending") assert.equal(frame.navigations.length, 0);
    else {
      assert.equal(frame.src, "about:blank");
      assert.equal(frame.hidden, true);
    }
  });
}

test("viewer release allows another preview to start and be cleaned up", (t) => {
  const fixture = createFixture(t);
  fixture.startPreview();
  const transition = fixture.prepareTransition();
  transition.mountLoadedFrame();
  transition.release({ keepFrame: true });
  // Match the viewer's close order: mount the frame back in the viewer, then
  // release the retained preview and explicitly unload the closed project.
  fixture.document.body.append(fixture.frame);
  transition.releaseLoadedFrame();
  fixture.frame.src = "about:blank";
  assert.equal(fixture.card.classList.contains("is-frame-host"), false);
  fixture.startPreview();
  assert.equal(fixture.card.classList.contains("is-preview-loaded"), true);
  fixture.preview.stopAll();
  assert.equal(fixture.frame.src, "about:blank");
});

test("tab changes leave directly opened viewer frames alone", (t) => {
  const { document, frame } = createFixture(t);
  document.body.append(frame);
  frame.src = "https://example.test/project/";
  const contentWindow = frame.contentWindow;
  document.visibilityState = "hidden";
  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(frame.contentWindow, contentWindow);
  assert.equal(frame.hidden, false);
});

// A small DOM/event adapter exercises the real preview controller without a
// browser dependency. Rendering and native View Transitions need browser QA.
function createFixture(t) {
  class Element extends EventTarget {
    children = [];
    parentElement = null;
    hidden = false;
    dataset = {};
    classes = new Set();
    classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
    style = { setProperty() {}, removeProperty() {} };
    set className(value) { this.classes = new Set(value.split(/\s+/)); }
    append(child) {
      child.remove();
      this.children.push(child);
      child.parentElement = this;
    }
    remove() {
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
        this.parentElement = null;
      }
    }
    contains(child) {
      return child === this || this.children.some((entry) => entry.contains(child));
    }
    closest(selector) {
      return this.classList.contains(selector.slice(1)) ? this : this.parentElement?.closest(selector);
    }
    querySelector() { return null; }
    setAttribute() {}
    removeAttribute() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 240, height: 180 }; }
  }

  const timers = new Map();
  let timerId = 0;
  let frames = new Map();
  const document = new EventTarget();
  Object.assign(document, {
    body: new Element(), head: new Element(), documentElement: new Element(),
    createElement: () => new Element(), hidden: false, visibilityState: "visible",
  });
  const window = new EventTarget();
  Object.assign(window, {
    innerWidth: 800, innerHeight: 600,
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => { frames.set(++timerId, callback); return timerId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  for (const [key, value] of Object.entries({ document, window, Node: Element,
    location: new URL("https://example.test/") })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }

  const directory = new Element();
  const card = new Element();
  card.className = "project-card";
  directory.append(card);
  document.body.append(directory);
  const frame = new Element();
  frame.navigations = [];
  frame.contentWindow = { location: new URL("about:blank") };
  Object.defineProperty(frame, "src", {
    get: () => frame.contentWindow.location.href,
    set(value) {
      frame.navigations.push(value);
      frame.contentWindow = { location: new URL(value) };
      frame.dispatchEvent(new Event("load"));
    },
  });
  const project = { path: "/project/" };
  const preview = setupCardPreview(directory, frame, () => project);
  function flushTimers() {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((callback) => callback());
  }
  return {
    document, directory, card, frame, preview, flushTimers,
    prepareTransition: () => preview.prepareOpenTransition(card, project),
    startPreview() {
      preview.previewCard(card);
      flushTimers();
      for (let i = 0; i < 2; i++) {
        const pending = frames;
        frames = new Map();
        pending.forEach((callback) => callback(performance.now()));
      }
      assert.equal(card.classList.contains("is-preview-loaded"), true);
    },
  };
}
