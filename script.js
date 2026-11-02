/* =========================================================
   ADAPTIVE STUDIO
   HCI LAB EXPERIMENT 12
   Context-Aware Adaptive Toolbar
   ========================================================= */

"use strict";

/* -------------------- DOM REFERENCES -------------------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

const canvas = $("#designCanvas");
const toolbar = $("#toolbarTools");
const properties = $("#propertiesContent");
const activityList = $("#activityList");
const toastContainer = $("#toastContainer");

let selectedIds = new Set();
let nextId = 2;
let zoom = 100;

let undoStack = [];
let redoStack = [];

let interactionCount = 0;
let contextChangeCount = 0;
let errorCount = 0;

let usedTools = new Set();
let contextHistory = [];
let activityHistory = [];

const MAX_HISTORY = 50;

const typeNames = {
    text: "Text",
    image: "Image",
    shape: "Shape",
    table: "Table",
    video: "Video"
};

const typeIcons = {
    text: "T",
    image: "▧",
    shape: "◇",
    table: "▤",
    video: "▷",
    general: "✦"
};

/* -------------------- OBJECT TOOL DEFINITIONS -------------------- */

const toolDefinitions = {
    none: [
        { id: "undo", label: "Undo", icon: "↶" },
        { id: "redo", label: "Redo", icon: "↷" },
        { id: "zoomOut", label: "Zoom Out", icon: "−" },
        { id: "zoomIn", label: "Zoom In", icon: "+" },
        { id: "deselect", label: "Deselect", icon: "⊘" }
    ],

    text: [
        { id: "bold", label: "Bold", icon: "B" },
        { id: "italic", label: "Italic", icon: "I" },
        { id: "underline", label: "Underline", icon: "U" },
        { id: "fontSize", label: "Font Size", icon: "Aa", control: "number" },
        { id: "textColor", label: "Text Color", icon: "◉", control: "color" },
        { id: "alignLeft", label: "Align Left", icon: "☰" },
        { id: "alignCenter", label: "Center", icon: "≡" },
        { id: "duplicate", label: "Duplicate", icon: "▣" },
        { id: "delete", label: "Delete", icon: "⌫" }
    ],

    image: [
        { id: "rotateLeft", label: "Rotate −90°", icon: "↶" },
        { id: "rotateRight", label: "Rotate +90°", icon: "↻" },
        { id: "flip", label: "Flip", icon: "⇋" },
        { id: "opacity", label: "Opacity", icon: "◐", control: "range" },
        { id: "borderColor", label: "Border", icon: "▣", control: "color" },
        { id: "duplicate", label: "Duplicate", icon: "▣" },
        { id: "delete", label: "Delete", icon: "⌫" }
    ],

    shape: [
        { id: "fillColor", label: "Fill Color", icon: "◉", control: "color" },
        { id: "borderColor", label: "Border", icon: "▣", control: "color" },
        { id: "rotateLeft", label: "Rotate −15°", icon: "↶" },
        { id: "rotateRight", label: "Rotate +15°", icon: "↻" },
        { id: "duplicate", label: "Duplicate", icon: "▣" },
        { id: "bringFront", label: "Bring Forward", icon: "↑" },
        { id: "sendBack", label: "Send Backward", icon: "↓" },
        { id: "delete", label: "Delete", icon: "⌫" }
    ],

    table: [
        { id: "addRow", label: "Add Row", icon: "＋" },
        { id: "addColumn", label: "Add Column", icon: "⊞" },
        { id: "deleteRow", label: "Delete Row", icon: "−" },
        { id: "deleteColumn", label: "Delete Column", icon: "⊟" },
        { id: "cellColor", label: "Cell Color", icon: "◉", control: "color" },
        { id: "duplicate", label: "Duplicate", icon: "▣" },
        { id: "delete", label: "Delete", icon: "⌫" }
    ],

    video: [
        { id: "play", label: "Play / Pause", icon: "▶" },
        { id: "volume", label: "Volume", icon: "♪", control: "range" },
        { id: "playbackSpeed", label: "Speed", icon: "⏩", control: "select" },
        { id: "loop", label: "Loop", icon: "↻" },
        { id: "borderColor", label: "Border", icon: "▣", control: "color" },
        { id: "duplicate", label: "Duplicate", icon: "▣" },
        { id: "delete", label: "Delete", icon: "⌫" }
    ],

    multiple: [
        { id: "alignLeft", label: "Align Left", icon: "☰" },
        { id: "alignCenter", label: "Align Center", icon: "≡" },
        { id: "duplicate", label: "Duplicate", icon: "▣" },
        { id: "bringFront", label: "Bring Forward", icon: "↑" },
        { id: "sendBack", label: "Send Backward", icon: "↓" },
        { id: "delete", label: "Delete All", icon: "⌫" },
        { id: "deselect", label: "Deselect", icon: "⊘" }
    ]
};

/* -------------------- UTILITIES -------------------- */

function getObjects() {
    return $$(".canvas-object", canvas);
}

function getSelectedObjects() {
    return getObjects().filter(object =>
        selectedIds.has(object.dataset.id)
    );
}

function getPrimaryObject() {
    return getSelectedObjects()[0] || null;
}

function getObjectById(id) {
    return getObjects().find(object => object.dataset.id === id);
}

function getObjectType(object) {
    return object?.dataset.type || "none";
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function safeColor(value, fallback = "#6558e8") {
    return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

function numberValue(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getContextKey() {
    const objects = getSelectedObjects();

    if (!objects.length) return "none";
    if (objects.length > 1) return "multiple";

    return getObjectType(objects[0]);
}

function getContextLabel() {
    const objects = getSelectedObjects();

    if (!objects.length) return "General tools";
    if (objects.length > 1) return "Multi-object tools";

    return `${typeNames[getObjectType(objects[0])]} tools`;
}

function getObjectLabel(object) {
    if (!object) return "No selection";

    const heading = object.querySelector("h3, .image-placeholder b, .video-placeholder b");

    return heading?.textContent.trim() ||
        `${typeNames[object.dataset.type]} object`;
}

function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

/* -------------------- INTERACTION LOGGING -------------------- */

function logInteraction(action, detail = "", options = {}) {
    if (!options.skipCount) {
        interactionCount++;
    }

    if (options.error) {
        errorCount++;
    }

    const entry = {
        time: new Date().toISOString(),
        action,
        detail,
        error: Boolean(options.error)
    };

    activityHistory.unshift(entry);
    activityHistory = activityHistory.slice(0, 40);

    renderActivity();
    updateAnalytics();
}

function renderActivity() {
    if (!activityHistory.length) {
        activityList.innerHTML =
            '<div class="activity-empty">Your interactions will appear here.</div>';
        return;
    }

    activityList.innerHTML = activityHistory.slice(0, 8).map(entry => {
        const time = new Date(entry.time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        return `
            <div class="activity-item">
                <div class="activity-icon">
                    ${entry.error ? "!" : "✓"}
                </div>
                <div class="activity-text">
                    <b>${escapeHTML(entry.action)}</b>
                    <small>${escapeHTML(entry.detail || "Interaction recorded")}</small>
                </div>
                <span class="activity-time">${escapeHTML(time)}</span>
            </div>
        `;
    }).join("");
}

function updateAnalytics() {
    $("#metricInteractions").textContent = interactionCount;
    $("#metricContexts").textContent = contextChangeCount;
    $("#metricTools").textContent = usedTools.size;
    $("#metricErrors").textContent = errorCount;

    const rows = [
        ["Interactions", interactionCount],
        ["Context changes", contextChangeCount],
        ["Distinct tools", usedTools.size],
        ["Interaction errors", errorCount]
    ];

    const max = Math.max(1, ...rows.map(row => row[1]));

    $("#analyticsSummary").innerHTML = rows.map(([label, value]) => `
        <div class="analytics-row">
            <span>${escapeHTML(label)}</span>
            <div class="analytics-bar">
                <div style="width:${(value / max) * 100}%"></div>
            </div>
            <b>${value}</b>
        </div>
    `).join("");
}

/* -------------------- UNDO / REDO -------------------- */

function takeSnapshot() {
    return {
        html: canvas.innerHTML,
        nextId,
        zoom
    };
}

function restoreSnapshot(snapshot) {
    canvas.innerHTML = snapshot.html;
    nextId = snapshot.nextId;
    zoom = snapshot.zoom;

    selectedIds.clear();

    applyZoom();
    renderSelection();
    renderToolbar();
    renderProperties();
    updateUndoRedoButtons();
}

function commitChange(description, callback) {
    undoStack.push(takeSnapshot());

    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }

    redoStack = [];

    try {
        callback();
    } catch (error) {
        restoreSnapshot(undoStack.pop());
        console.error(error);
        logInteraction("Action failed", description, { error: true });
        showToast("The action could not be completed.", "error");
        return false;
    }

    renderSelection();
    renderToolbar();
    renderProperties();
    updateUndoRedoButtons();

    logInteraction("Edit completed", description);

    return true;
}

function undo() {
    if (!undoStack.length) {
        showToast("Nothing to undo.");
        return;
    }

    redoStack.push(takeSnapshot());
    restoreSnapshot(undoStack.pop());

    logInteraction("Undo", "Restored the previous canvas state");
    showToast("Undo successful");
}

function redo() {
    if (!redoStack.length) {
        showToast("Nothing to redo.");
        return;
    }

    undoStack.push(takeSnapshot());
    restoreSnapshot(redoStack.pop());

    logInteraction("Redo", "Restored the next canvas state");
    showToast("Redo successful");
}

function updateUndoRedoButtons() {
    $("#undoBtn").disabled = undoStack.length === 0;
    $("#redoBtn").disabled = redoStack.length === 0;
}

/* -------------------- OBJECT SELECTION -------------------- */

function selectObject(object, additive = false) {
    if (!object) return;

    const previousContext = getContextKey();

    if (!additive) {
        selectedIds.clear();
    }

    if (additive && selectedIds.has(object.dataset.id)) {
        selectedIds.delete(object.dataset.id);
    } else {
        selectedIds.add(object.dataset.id);
    }

    renderSelection();

    const nextContext = getContextKey();

    if (previousContext !== nextContext) {
        contextChangeCount++;
        contextHistory.push(nextContext);
    }

    logInteraction(
        "Object selected",
        `${selectedIds.size} selected · ${getContextLabel()}`
    );
}

function deselectAll() {
    if (!selectedIds.size) {
        showToast("No objects are selected.");
        return;
    }

    selectedIds.clear();

    renderSelection();
    logInteraction("Selection cleared", "Returned to general toolbar");
}

function renderSelection() {
    getObjects().forEach(object => {
        const isSelected = selectedIds.has(object.dataset.id);

        object.classList.toggle(
            "selected",
            isSelected && selectedIds.size === 1
        );

        object.classList.toggle(
            "multi-selected",
            isSelected && selectedIds.size > 1
        );
    });

    const count = selectedIds.size;

    $("#selectionCount").textContent =
        `${count} object${count === 1 ? "" : "s"} selected`;

    $("#contextStatus").textContent =
        count ? getContextLabel() : "No object selected";

    const primary = getPrimaryObject();

    $("#selectedObjectName").textContent =
        count > 1 ? `${count} objects selected` : getObjectLabel(primary);

    $("#selectedObjectType").textContent =
        count > 1 ? "Multi-selection" :
        primary ? `${typeNames[primary.dataset.type]} element` :
        "Waiting for interaction";

    renderToolbar();
    renderProperties();
}

/* -------------------- ADAPTIVE TOOLBAR -------------------- */

function createToolButton(definition) {
    const button = document.createElement("button");

    button.className = "tool-btn";
    button.dataset.action = definition.id;
    button.title = definition.label;
    button.setAttribute("aria-label", definition.label);

    if (definition.control === "color") {
        button.innerHTML = `
            <input type="color"
                   data-control="${definition.id}"
                   aria-label="${definition.label}"
                   title="${definition.label}">
            <span>${definition.label}</span>
        `;

        button.addEventListener("click", event => {
            if (event.target.matches('input[type="color"]')) {
                event.stopPropagation();
            }
        });

        return button;
    }

    if (definition.control === "number") {
        button.innerHTML = `
            <span class="tool-symbol">${definition.icon}</span>
            <input type="number" data-control="${definition.id}"
                   min="8" max="72" value="16"
                   aria-label="Font size">
        `;

        button.style.cursor = "default";
        return button;
    }

    if (definition.control === "range") {
        const label = definition.id === "opacity" ? "Opacity" : "Volume";

        button.innerHTML = `
            <span class="tool-symbol">${definition.icon}</span>
            <span>${label}</span>
            <input type="range" data-control="${definition.id}"
                   min="0" max="100" value="100"
                   aria-label="${label}" style="width:65px">
        `;

        button.style.cursor = "default";
        return button;
    }

    if (definition.control === "select") {
        button.innerHTML = `
            <span>${definition.label}</span>
            <select data-control="${definition.id}" aria-label="Playback speed">
                <option value="0.5">0.5×</option>
                <option value="1" selected>1×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
            </select>
        `;

        return button;
    }

    button.innerHTML = `
        <span class="tool-symbol">${definition.icon}</span>
        <span>${definition.label}</span>
    `;

    return button;
}

function renderToolbar() {
    const context = getContextKey();
    const definitions = toolDefinitions[context] || toolDefinitions.none;

    toolbar.replaceChildren();

    definitions.forEach(definition => {
        toolbar.appendChild(createToolButton(definition));
    });

    $("#toolCount").textContent =
        `${definitions.length} available tools`;

    const descriptions = {
        none: "General tools for navigation and workspace management.",
        text: "Typography and formatting tools for selected text.",
        image: "Visual adjustment tools for the selected image.",
        shape: "Shape styling, rotation, and layer controls.",
        table: "Table structure and cell formatting controls.",
        video: "Media playback and video presentation controls.",
        multiple: "Actions that can be applied to multiple objects."
    };

    $("#toolbarDescription").textContent =
        descriptions[context] || descriptions.none;

    $("#toolbarHint").textContent =
        context === "none" ? "Select an object to adapt the toolbar" :
        context === "multiple" ? "Multi-selection mode" :
        `Optimized for ${context} editing`;

    updateToolbarValues();
}

function updateToolbarValues() {
    const object = getPrimaryObject();
    if (!object) return;

    const type = object.dataset.type;

    $$("[data-control]", toolbar).forEach(control => {
        const key = control.dataset.control;

        if (key === "fontSize") {
            const text = object.querySelector(".object-content");
            if (text) control.value = parseInt(getComputedStyle(text).fontSize) || 16;
        }

        if (key === "textColor") {
            control.value = safeColor(object.dataset.textColor, "#252a45");
        }

        if (key === "fillColor" && type === "shape") {
            control.value = safeColor(object.dataset.fillColor, "#f79e7d");
        }

        if (key === "borderColor") {
            control.value = safeColor(object.dataset.borderColor, "#6558e8");
        }

        if (key === "cellColor") {
            control.value = safeColor(object.dataset.cellColor, "#eeecff");
        }

        if (key === "opacity") {
            control.value = object.dataset.opacity || 100;
        }

        if (key === "volume") {
            control.value = object.dataset.volume || 70;
        }

        if (key === "playbackSpeed") {
            control.value = object.dataset.playbackSpeed || "1";
        }
    });
}

/* -------------------- PROPERTY PANEL -------------------- */

function field(label, inputHTML) {
    return `
        <label class="property-field">
            <span>${label}</span>
            ${inputHTML}
        </label>
    `;
}

function colorField(label, key, value) {
    return field(
        label,
        `<input type="color" data-property="${key}"
                value="${safeColor(value)}">`
    );
}

function numberField(label, key, value, min = 0, max = 1000) {
    return field(
        label,
        `<input type="number" data-property="${key}"
                value="${escapeHTML(value)}"
                min="${min}" max="${max}" step="1">`
    );
}

function rangeField(label, key, value, min = 0, max = 100) {
    return field(
        label,
        `<input type="range" data-property="${key}"
                value="${value}" min="${min}" max="${max}">
         <small data-range-value="${key}">${value}</small>`
    );
}

function renderProperties() {
    const objects = getSelectedObjects();
    const object = objects[0];

    if (!objects.length) {
        properties.innerHTML = `
            <div class="empty-properties">
                <div class="empty-icon">✳</div>
                <h4>Nothing selected</h4>
                <p>Choose an object on the canvas to view its properties.</p>
            </div>
        `;
        return;
    }

    if (objects.length > 1) {
        properties.innerHTML = `
            <div class="property-group">
                <h4>Multi-selection</h4>
                <p>${objects.length} objects are selected.</p>
                <p style="color:var(--muted);line-height:1.7">
                    Move any selected object to reposition it.
                    Use the adaptive toolbar to duplicate, align,
                    change layers, or delete the selection.
                </p>
                ${field("Horizontal alignment", `
                    <select data-property="multiAlign">
                        <option value="left">Align left</option>
                        <option value="center">Align centers</option>
                    </select>
                `)}
                <button class="property-action" data-property-action="align">
                    Apply alignment
                </button>
                <button class="property-action" data-property-action="duplicate">
                    Duplicate selected objects
                </button>
                <button class="property-action" data-property-action="delete">
                    Delete selected objects
                </button>
            </div>
        `;
        return;
    }

    const type = object.dataset.type;
    const x = Math.round(parseFloat(object.style.left) || 0);
    const y = Math.round(parseFloat(object.style.top) || 0);

    let html = `
        <div class="property-group">
            <h4>Object information</h4>
            ${field("Object name", `
                <input type="text" data-property="objectName"
                    value="${escapeHTML(object.dataset.name || getObjectLabel(object))}">
            `)}
            <div class="property-inline">
                ${numberField("X position", "x", x, -2000, 2000)}
                ${numberField("Y position", "y", y, -2000, 2000)}
            </div>
            <div class="property-inline">
                ${numberField("Width", "width", object.offsetWidth || 100, 20, 2000)}
                ${numberField("Height", "height", object.offsetHeight || 50, 20, 2000)}
            </div>
        </div>
    `;

    if (type === "text") {
        const text = object.querySelector(".object-content");

        html += `
            <div class="property-group">
                <h4>Typography</h4>
                ${field("Font family", `
                    <select data-property="fontFamily">
                        <option value="DM Sans">DM Sans</option>
                        <option value="Arial">Arial</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Verdana">Verdana</option>
                    </select>
                `)}
                ${numberField(
                    "Font size",
                    "fontSize",
                    parseInt(getComputedStyle(text).fontSize) || 16,
                    8, 72
                )}
                ${colorField(
                    "Text color",
                    "textColor",
                    object.dataset.textColor || "#252a45"
                )}
                ${field("Text alignment", `
                    <select data-property="textAlign">
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                `)}
                <button class="property-action" data-property-action="editText">
                    Edit text content
                </button>
            </div>
        `;
    }

    if (type === "image") {
        html += `
            <div class="property-group">
                <h4>Image appearance</h4>
                ${colorField(
                    "Border color",
                    "borderColor",
                    object.dataset.borderColor || "#6558e8"
                )}
                ${rangeField("Opacity", "opacity", object.dataset.opacity || 100)}
                <button class="property-action" data-property-action="flip">
                    Flip horizontally
                </button>
                <button class="property-action" data-property-action="rotateRight">
                    Rotate 90°
                </button>
            </div>
        `;
    }

    if (type === "shape") {
        html += `
            <div class="property-group">
                <h4>Shape styling</h4>
                ${colorField(
                    "Fill color",
                    "fillColor",
                    object.dataset.fillColor || "#f79e7d"
                )}
                ${colorField(
                    "Border color",
                    "borderColor",
                    object.dataset.borderColor || "#6558e8"
                )}
                ${numberField(
                    "Corner radius",
                    "radius",
                    object.dataset.radius || 23,
                    0, 100
                )}
                ${numberField(
                    "Rotation",
                    "rotation",
                    object.dataset.rotation || 0,
                    -360, 360
                )}
            </div>
        `;
    }

    if (type === "table") {
        html += `
            <div class="property-group">
                <h4>Table settings</h4>
                ${colorField(
                    "Cell color",
                    "cellColor",
                    object.dataset.cellColor || "#eeecff"
                )}
                ${field("Header text", `
                    <input type="text" data-property="tableHeader"
                        value="${escapeHTML(object.querySelector("th")?.textContent || "Task")}">
                `)}
                <button class="property-action" data-property-action="addRow">
                    Add table row
                </button>
                <button class="property-action" data-property-action="addColumn">
                    Add table column
                </button>
            </div>
        `;
    }

    if (type === "video") {
        html += `
            <div class="property-group">
                <h4>Media settings</h4>
                ${rangeField("Volume", "volume", object.dataset.volume || 70)}
                ${field("Playback speed", `
                    <select data-property="playbackSpeed">
                        <option value="0.5">0.5×</option>
                        <option value="1">1×</option>
                        <option value="1.5">1.5×</option>
                        <option value="2">2×</option>
                    </select>
                `)}
                <label class="property-check">
                    <input type="checkbox" data-property="loop"
                        ${object.dataset.loop === "true" ? "checked" : ""}>
                    Loop playback
                </label>
                <p style="color:var(--muted);font-size:10px;line-height:1.6">
                    This is a simulated media object. Playback controls
                    demonstrate context-aware interaction; no video file is loaded.
                </p>
            </div>
        `;
    }

    html += `
        <div class="property-group">
            <h4>Object actions</h4>
            <button class="property-action" data-property-action="duplicate">
                Duplicate object
            </button>
            <button class="property-action" data-property-action="bringFront">
                Bring forward
            </button>
            <button class="property-action" data-property-action="delete">
                Delete object
            </button>
        </div>
    `;

    properties.innerHTML = html;

    const fontFamily = $('[data-property="fontFamily"]', properties);
    if (fontFamily) {
        fontFamily.value = object.dataset.fontFamily || "DM Sans";
    }

    const alignment = $('[data-property="textAlign"]', properties);
    if (alignment) {
        alignment.value = object.dataset.textAlign || "left";
    }

    const speed = $('[data-property="playbackSpeed"]', properties);
    if (speed) {
        speed.value = object.dataset.playbackSpeed || "1";
    }

    const multiAlign = $('[data-property="multiAlign"]', properties);
    if (multiAlign) {
        multiAlign.value = "left";
    }
}

/* -------------------- ADD NEW OBJECTS -------------------- */

function addObject(type) {
    if (!typeNames[type]) return;

    const id = `${type}-${nextId++}`;
    let markup = "";

    if (type === "text") {
        markup = `
            <div class="object-content" contenteditable="false">
                <h3>New heading</h3>
                <p>Click Edit text content to customize this text.</p>
            </div>
        `;
    }

    if (type === "image") {
        markup = `
            <div class="image-placeholder">
                <span class="image-symbol">▧</span>
                <b>New Image</b>
                <small>Visual element</small>
            </div>
        `;
    }

    if (type === "shape") {
        markup = '<div class="shape-inner"></div>';
    }

    if (type === "table") {
        markup = `
            <table>
                <thead><tr><th>Column 1</th><th>Column 2</th></tr></thead>
                <tbody><tr><td>Item 1</td><td>Item 2</td></tr></tbody>
            </table>
        `;
    }

    if (type === "video") {
        markup = `
            <div class="video-placeholder">
                <button class="play-symbol" tabindex="-1">▶</button>
                <b>New Video</b>
                <small>Demo media object</small>
            </div>
        `;
    }

    commitChange(`Added ${typeNames[type]} object`, () => {
        const object = document.createElement("div");

        object.className = `canvas-object ${type}-object`;
        object.dataset.type = type;
        object.dataset.id = id;
        object.dataset.name = `New ${typeNames[type]}`;
        object.tabIndex = 0;
        object.style.left = "70px";
        object.style.top = "90px";
        object.innerHTML = markup;

        if (type === "shape") {
            object.style.width = "85px";
            object.style.height = "85px";
        }

        if (type === "table") {
            object.style.width = "230px";
        }

        canvas.appendChild(object);

        selectedIds.clear();
        selectedIds.add(id);
    });

    showToast(`${typeNames[type]} added to the canvas`);
}

/* -------------------- DUPLICATION AND DELETION -------------------- */

function duplicateSelected() {
    const objects = getSelectedObjects();

    if (!objects.length) {
        showToast("Select an object first.");
        return;
    }

    commitChange("Duplicated selected object(s)", () => {
        const clones = [];

        objects.forEach(object => {
            const clone = object.cloneNode(true);
            const id = `${object.dataset.type}-${nextId++}`;

            clone.dataset.id = id;
            clone.style.left = `${(parseFloat(object.style.left) || 0) + 25}px`;
            clone.style.top = `${(parseFloat(object.style.top) || 0) + 25}px`;

            clone.classList.remove("selected", "multi-selected");

            clones.push(clone);
        });

        clones.forEach(clone => canvas.appendChild(clone));

        selectedIds.clear();
        clones.forEach(clone => selectedIds.add(clone.dataset.id));
    });

    showToast("Object duplicated");
}

function deleteSelected() {
    const objects = getSelectedObjects();

    if (!objects.length) {
        showToast("Select an object to delete.");
        return;
    }

    commitChange(`Deleted ${objects.length} object(s)`, () => {
        objects.forEach(object => object.remove());
        selectedIds.clear();
    });

    showToast("Selection deleted");
}

/* -------------------- OBJECT TRANSFORMATIONS -------------------- */

function rotateObject(object, degrees) {
    const current = numberValue(object.dataset.rotation, 0);
    const next = current + degrees;

    object.dataset.rotation = next;

    if (object.dataset.type === "shape") {
        const inner = $(".shape-inner", object);
        if (inner) {
            inner.style.transform = `rotate(${next}deg)`;
        }
    } else {
        object.style.transform = `rotate(${next}deg)`;
    }
}

function flipObject(object) {
    const flipped = object.dataset.flipped !== "true";

    object.dataset.flipped = String(flipped);

    const target = object.querySelector(
        ".image-placeholder, .shape-inner, .video-placeholder"
    ) || object;

    target.style.transform =
        `scaleX(${flipped ? -1 : 1}) rotate(${object.dataset.rotation || 0}deg)`;
}

function setOpacity(object, value) {
    const opacity = clamp(numberValue(value, 100), 0, 100);
    object.dataset.opacity = opacity;
    object.style.opacity = opacity / 100;
}

function setObjectColor(object, key, value) {
    const color = safeColor(value);

    object.dataset[key] = color;

    if (key === "fillColor" && object.dataset.type === "shape") {
        $(".shape-inner", object).style.background = color;
    }

    if (key === "borderColor") {
        object.style.borderColor = color;
    }

    if (key === "textColor" && object.dataset.type === "text") {
        object.style.color = color;
        $(".object-content", object).style.color = color;
    }

    if (key === "cellColor" && object.dataset.type === "table") {
        $$("th", object).forEach(cell => {
            cell.style.background = color;
        });

        $$("td", object).forEach(cell => {
            cell.style.background = color;
        });
    }
}

function alignSelected(mode) {
    const objects = getSelectedObjects();

    if (objects.length < 2) {
        showToast("Select at least two objects to align.");
        return;
    }

    commitChange(`Aligned ${objects.length} objects`, () => {
        const first = objects[0];
        const baseX = parseFloat(first.style.left) || 0;

        if (mode === "left") {
            objects.forEach(object => {
                object.style.left = `${baseX}px`;
            });
        } else {
            const center = baseX + first.offsetWidth / 2;

            objects.forEach(object => {
                object.style.left = `${center - object.offsetWidth / 2}px`;
            });
        }
    });

    showToast("Objects aligned");
}

function changeLayer(direction) {
    const objects = getSelectedObjects();
    if (!objects.length) return;

    commitChange(direction > 0 ? "Brought object forward" : "Sent object backward", () => {
        objects.forEach(object => {
            if (direction > 0) {
                canvas.appendChild(object);
            } else {
                canvas.insertBefore(object, canvas.firstElementChild);
            }
        });
    });
}

function addTableRow(object) {
    const table = $("table", object);
    if (!table) return;

    const columns = table.querySelectorAll("thead th").length || 2;
    const row = table.insertRow(-1);

    for (let i = 0; i < columns; i++) {
        const cell = row.insertCell();
        cell.textContent = `New item ${i + 1}`;

        if (object.dataset.cellColor) {
            cell.style.background = object.dataset.cellColor;
        }
    }
}

function addTableColumn(object) {
    const table = $("table", object);
    if (!table) return;

    const header = table.tHead?.rows[0];
    if (!header) return;

    const th = document.createElement("th");
    th.textContent = `Column ${header.cells.length + 1}`;
    header.appendChild(th);

    [...table.tBodies].forEach(body => {
        [...body.rows].forEach(row => {
            const td = row.insertCell();
            td.textContent = "New cell";

            if (object.dataset.cellColor) {
                td.style.background = object.dataset.cellColor;
            }
        });
    });
}

function deleteTableRow(object) {
    const table = $("table", object);
    if (!table || !table.tBodies[0]?.rows.length) {
        showToast("There is no body row to delete.");
        return;
    }

    table.tBodies[0].deleteRow(-1);
}

function deleteTableColumn(object) {
    const table = $("table", object);
    if (!table || !table.rows.length) return;

    const columnCount = table.rows[0].cells.length;

    if (columnCount <= 1) {
        showToast("A table must keep at least one column.");
        return;
    }

    [...table.rows].forEach(row => {
        if (row.cells.length) row.deleteCell(-1);
    });
}

/* -------------------- TOOL EXECUTION -------------------- */

function executeAction(action) {
    const objects = getSelectedObjects();
    const object = objects[0];

    if (action === "undo") return undo();
    if (action === "redo") return redo();
    if (action === "zoomIn") return setZoom(zoom + 10);
    if (action === "zoomOut") return setZoom(zoom - 10);
    if (action === "deselect") return deselectAll();
    if (action === "duplicate") return duplicateSelected();
    if (action === "delete") return deleteSelected();

    if (!object) {
        showToast("Select an object first.");
        return;
    }

    if (action === "alignLeft") return alignSelected("left");
    if (action === "alignCenter") return alignSelected("center");

    if (action === "bringFront") return changeLayer(1);
    if (action === "sendBack") return changeLayer(-1);

    if (action === "rotateLeft" || action === "rotateRight") {
        const degrees = object.dataset.type === "shape" ? 15 : 90;
        const direction = action === "rotateLeft" ? -degrees : degrees;

        commitChange("Rotated object", () => {
            objects.forEach(item => rotateObject(item, direction));
        });

        showToast("Rotation applied");
        return;
    }

    if (action === "flip") {
        commitChange("Flipped image", () => {
            objects.forEach(flipObject);
        });
        return;
    }

    if (action === "addRow") {
        commitChange("Added table row", () => {
            objects.forEach(addTableRow);
        });
        showToast("Table row added");
        return;
    }

    if (action === "addColumn") {
        commitChange("Added table column", () => {
            objects.forEach(addTableColumn);
        });
        showToast("Table column added");
        return;
    }

    if (action === "deleteRow") {
        commitChange("Deleted table row", () => {
            objects.forEach(deleteTableRow);
        });
        return;
    }

    if (action === "deleteColumn") {
        commitChange("Deleted table column", () => {
            objects.forEach(deleteTableColumn);
        });
        return;
    }

    if (action === "bold" || action === "italic" || action === "underline") {
        commitChange(`Applied ${action} formatting`, () => {
            objects.forEach(item => {
                const content = $(".object-content", item);
                if (!content) return;

                const styleKey = {
                    bold: "fontWeight",
                    italic: "fontStyle",
                    underline: "textDecoration"
                }[action];

                const current = content.style[styleKey];

                if (action === "bold") {
                    content.style.fontWeight =
                        current === "bold" ? "400" : "700";
                }

                if (action === "italic") {
                    content.style.fontStyle =
                        current === "italic" ? "normal" : "italic";
                }

                if (action === "underline") {
                    content.style.textDecoration =
                        current === "underline" ? "none" : "underline";
                }
            });
        });

        return;
    }

    if (action === "alignCenter" || action === "alignLeft") {
        commitChange("Changed text alignment", () => {
            objects.forEach(item => {
                const content = $(".object-content", item);
                if (content) {
                    content.style.textAlign =
                        action === "alignCenter" ? "center" : "left";
                }
            });
        });
        return;
    }

    if (action === "play") {
        const isPlaying = object.dataset.playing !== "true";
        object.dataset.playing = String(isPlaying);

        const playButton = $(".play-symbol", object);

        if (playButton) {
            playButton.textContent = isPlaying ? "Ⅱ" : "▶";
        }

        logInteraction(
            isPlaying ? "Media started" : "Media paused",
            "Simulated video playback"
        );

        showToast(isPlaying ? "Simulated playback started" : "Playback paused");
        return;
    }

    if (action === "loop") {
        const enabled = object.dataset.loop !== "true";
        object.dataset.loop = String(enabled);

        logInteraction("Loop setting changed", enabled ? "Loop enabled" : "Loop disabled");
        showToast(enabled ? "Loop enabled" : "Loop disabled");

        renderProperties();
        return;
    }

    showToast("This tool is not available in the current context.", "error");
}

/* -------------------- TOOLBAR CONTROL EVENTS -------------------- */

toolbar.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const control = event.target.closest("[data-control]");

    if (control) return;

    const action = button.dataset.action;

    usedTools.add(action);
    executeAction(action);
});

toolbar.addEventListener("change", event => {
    const control = event.target.closest("[data-control]");
    if (!control) return;

    const action = control.dataset.control;
    const value = control.value;
    const objects = getSelectedObjects();

    if (!objects.length) return;

    usedTools.add(action);

    if (action === "fontSize") {
        commitChange("Changed font size", () => {
            objects.forEach(object => {
                const content = $(".object-content", object);
                if (content) {
                    content.style.fontSize = `${clamp(numberValue(value, 16), 8, 72)}px`;
                }
            });
        });
        return;
    }

    const colorKeys = {
        textColor: "textColor",
        fillColor: "fillColor",
        borderColor: "borderColor",
        cellColor: "cellColor"
    };

    if (colorKeys[action]) {
        commitChange(`Changed ${action}`, () => {
            objects.forEach(object => {
                setObjectColor(object, colorKeys[action], value);
            });
        });
        return;
    }

    if (action === "opacity") {
        commitChange("Changed opacity", () => {
            objects.forEach(object => setOpacity(object, value));
        });
        return;
    }

    if (action === "volume" || action === "playbackSpeed") {
        commitChange(`Changed ${action}`, () => {
            objects.forEach(object => {
                object.dataset[action] = value;
            });
        });
        return;
    }
});

toolbar.addEventListener("input", event => {
    const control = event.target.closest("[data-control]");
    if (!control || control.type !== "range") return;

    const label = control.parentElement.querySelector("span");

    if (label) {
        const name = control.dataset.control === "opacity" ? "Opacity" : "Volume";
        label.textContent = `${name}: ${control.value}%`;
    }
});

/* -------------------- PROPERTY PANEL EVENTS -------------------- */

properties.addEventListener("click", event => {
    const button = event.target.closest("[data-property-action]");
    if (!button) return;

    const action = button.dataset.propertyAction;
    const objects = getSelectedObjects();

    if (action === "duplicate") return duplicateSelected();
    if (action === "delete") return deleteSelected();

    if (action === "align") {
        const mode = $('[data-property="multiAlign"]', properties)?.value || "left";
        return alignSelected(mode);
    }

    if (action === "bringFront") return changeLayer(1);
    if (action === "flip") return executeAction("flip");
    if (action === "rotateRight") return executeAction("rotateRight");

    if (action === "addRow") {
        commitChange("Added table row", () => objects.forEach(addTableRow));
        return;
    }

    if (action === "addColumn") {
        commitChange("Added table column", () => objects.forEach(addTableColumn));
        return;
    }

    if (action === "editText") {
        const object = getPrimaryObject();
        if (!object) return;

        const content = $(".object-content", object);
        if (!content) return;

        const current = content.innerText;
        const replacement = prompt("Enter the new text content:", current);

        if (replacement === null) return;

        commitChange("Edited text content", () => {
            content.replaceChildren();

            const heading = document.createElement("h3");
            heading.textContent = replacement;

            content.appendChild(heading);
            object.dataset.name = replacement.slice(0, 60) || "Text object";
        });

        showToast("Text updated");
    }
});

properties.addEventListener("change", event => {
    const control = event.target.closest("[data-property]");
    if (!control) return;

    const key = control.dataset.property;
    const value = control.type === "checkbox" ?
        control.checked : control.value;

    const objects = getSelectedObjects();
    if (!objects.length) return;

    if (key === "multiAlign") return;

    if (key === "objectName") {
        const object = objects[0];

        commitChange("Renamed object", () => {
            object.dataset.name = String(value).slice(0, 100);

            const title = object.querySelector(
                "h3, .image-placeholder b, .video-placeholder b"
            );

            if (title) title.textContent = value || "Untitled object";
        });

        return;
    }

    if (key === "x" || key === "y") {
        const coordinate = clamp(numberValue(value), -2000, 2000);

        commitChange(`Changed ${key} position`, () => {
            objects.forEach(object => {
                object.style[key === "x" ? "left" : "top"] =
                    `${coordinate}px`;
            });
        });

        return;
    }

    if (key === "width" || key === "height") {
        const dimension = clamp(numberValue(value, 100), 20, 2000);

        commitChange(`Changed ${key}`, () => {
            objects.forEach(object => {
                object.style[key] = `${dimension}px`;
            });
        });

        return;
    }

    if (key === "fontSize") {
        const size = clamp(numberValue(value, 16), 8, 72);

        commitChange("Changed font size", () => {
            objects.forEach(object => {
                const content = $(".object-content", object);
                if (content) content.style.fontSize = `${size}px`;
            });
        });

        return;
    }

    if (key === "fontFamily") {
        commitChange("Changed font family", () => {
            objects.forEach(object => {
                object.dataset.fontFamily = value;
                const content = $(".object-content", object);
                if (content) content.style.fontFamily = value;
            });
        });

        return;
    }

    if (key === "textAlign") {
        commitChange("Changed text alignment", () => {
            objects.forEach(object => {
                const content = $(".object-content", object);
                if (content) content.style.textAlign = value;
            });
        });

        return;
    }

    if (["fillColor", "borderColor", "textColor", "cellColor"].includes(key)) {
        commitChange(`Changed ${key}`, () => {
            objects.forEach(object => setObjectColor(object, key, value));
        });

        return;
    }

    if (key === "opacity" || key === "volume") {
        commitChange(`Changed ${key}`, () => {
            objects.forEach(object => {
                if (key === "opacity") {
                    setOpacity(object, value);
                } else {
                    object.dataset.volume = clamp(numberValue(value), 0, 100);
                }
            });
        });

        return;
    }

    if (key === "playbackSpeed" || key === "loop") {
        commitChange(`Changed ${key}`, () => {
            objects.forEach(object => {
                object.dataset[key] = String(value);
            });
        });

        return;
    }

    if (key === "radius") {
        const radius = clamp(numberValue(value), 0, 100);

        commitChange("Changed shape radius", () => {
            objects.forEach(object => {
                object.dataset.radius = radius;

                const inner = $(".shape-inner", object);
                if (inner) inner.style.borderRadius = `${radius}px`;
            });
        });

        return;
    }

    if (key === "rotation") {
        const rotation = clamp(numberValue(value), -360, 360);

        commitChange("Changed shape rotation", () => {
            objects.forEach(object => {
                object.dataset.rotation = rotation;

                const inner = $(".shape-inner", object);

                if (inner) {
                    inner.style.transform = `rotate(${rotation}deg)`;
                } else {
                    object.style.transform = `rotate(${rotation}deg)`;
                }
            });
        });

        return;
    }

    if (key === "tableHeader") {
        commitChange("Changed table header", () => {
            objects.forEach(object => {
                const heading = $("th", object);
                if (heading) heading.textContent = value;
            });
        });
    }
});

properties.addEventListener("input", event => {
    const control = event.target.closest('[data-property="opacity"], [data-property="volume"]');
    if (!control) return;

    const output = control.parentElement.querySelector(
        `[data-range-value="${control.dataset.property}"]`
    );

    if (output) output.textContent = control.value;
});

/* -------------------- CANVAS SELECTION EVENTS -------------------- */

canvas.addEventListener("click", event => {
    const object = event.target.closest(".canvas-object");

    if (!object) {
        if (!event.ctrlKey && !event.metaKey) deselectAll();
        return;
    }

    if (event.target.closest("table")) {
        const clickedCell = event.target.closest("td, th");

        if (clickedCell) {
            $$(".cell-selected", canvas).forEach(cell => {
                cell.classList.remove("cell-selected");
            });

            clickedCell.classList.add("cell-selected");
        }
    }

    if (event.ctrlKey || event.metaKey) {
        selectObject(object, true);
    } else if (!selectedIds.has(object.dataset.id) || selectedIds.size > 1) {
        selectObject(object);
    }
});

canvas.addEventListener("dblclick", event => {
    const object = event.target.closest('.canvas-object[data-type="text"]');
    if (!object) return;

    selectObject(object);

    const content = $(".object-content", object);
    if (!content) return;

    const previous = content.getAttribute("contenteditable");
    content.setAttribute("contenteditable", "true");
    content.style.userSelect = "text";
    content.focus();

    showToast("Edit your text. Click outside when finished.");

    content.addEventListener("blur", () => {
        content.setAttribute("contenteditable", previous || "false");
        content.style.userSelect = "none";
    }, { once: true });
});

canvas.addEventListener("keydown", event => {
    const object = event.target.closest(".canvas-object");
    if (!object || event.target.isContentEditable) return;

    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectObject(object, event.ctrlKey || event.metaKey);
    }
});

/* -------------------- DRAG AND DROP -------------------- */

let dragState = null;

canvas.addEventListener("pointerdown", event => {
    const object = event.target.closest(".canvas-object");

    if (!object || event.button !== 0) return;
    if (event.target.isContentEditable) return;
    if (event.target.closest("table")) return;
    if (event.target.closest("button")) return;

    if (!selectedIds.has(object.dataset.id)) {
        selectObject(object, event.ctrlKey || event.metaKey);
    }

    const selected = getSelectedObjects();

    dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        objects: selected.map(item => ({
            element: item,
            x: parseFloat(item.style.left) || 0,
            y: parseFloat(item.style.top) || 0
        })),
        changed: false,
        before: takeSnapshot()
    };

    object.setPointerCapture?.(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        dragState.changed = true;
    }

    if (!dragState.changed) return;

    dragState.objects.forEach(item => {
        item.element.style.left = `${item.x + dx / (zoom / 100)}px`;
        item.element.style.top = `${item.y + dy / (zoom / 100)}px`;
    });
});

function finishDrag(event) {
    if (!dragState) return;

    if (event && event.pointerId !== dragState.pointerId) return;

    const state = dragState;
    dragState = null;

    if (state.changed) {
        undoStack.push(state.before);

        if (undoStack.length > MAX_HISTORY) undoStack.shift();

        redoStack = [];

        updateUndoRedoButtons();

        logInteraction("Objects moved", `${state.objects.length} object(s) repositioned`);
    }
}

canvas.addEventListener("pointerup", finishDrag);
canvas.addEventListener("pointercancel", finishDrag);

/* -------------------- ZOOM -------------------- */

function setZoom(value) {
    zoom = clamp(value, 50, 150);
    applyZoom();

    logInteraction("Canvas zoom changed", `${zoom}%`);
}

function applyZoom() {
    canvas.style.transform = `scale(${zoom / 100})`;
    $("#zoomLabel").textContent = `${zoom}%`;
}

$("#zoomInBtn").addEventListener("click", () => setZoom(zoom + 10));
$("#zoomOutBtn").addEventListener("click", () => setZoom(zoom - 10));

/* -------------------- SIDEBAR NAVIGATION -------------------- */

function navigateTo(page) {
    $$(".page").forEach(element => {
        element.classList.remove("active-page");
    });

    $$(".nav-item").forEach(element => {
        element.classList.toggle("active", element.dataset.page === page);
    });

    const pageElement = $(`#${page}Page`);

    if (pageElement) {
        pageElement.classList.add("active-page");
    }

    const titles = {
        editor: "Adaptive Editor",
        analytics: "Usability Analytics",
        shortcuts: "Keyboard Shortcuts"
    };

    $("#pageTitle").textContent = titles[page] || "Adaptive Editor";
    $("#pageBreadcrumb").textContent = titles[page] || "Adaptive Editor";

    if (page === "analytics") updateAnalytics();

    logInteraction("Navigation", `Opened ${titles[page] || page}`);
}

$$(".nav-item").forEach(button => {
    button.addEventListener("click", () => navigateTo(button.dataset.page));
});

$$("[data-add]").forEach(button => {
    button.addEventListener("click", () => addObject(button.dataset.add));
});

/* -------------------- DARK / LIGHT MODE -------------------- */

$("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");

    const dark = document.body.classList.contains("dark");

    $("#themeToggle").textContent = dark ? "☀" : "☾";

    try {
        localStorage.setItem("adaptive-theme", dark ? "dark" : "light");
    } catch (_) {}

    logInteraction("Theme changed", dark ? "Dark mode" : "Light mode");
});

try {
    if (localStorage.getItem("adaptive-theme") === "dark") {
        document.body.classList.add("dark");
        $("#themeToggle").textContent = "☀";
    }
} catch (_) {}

/* -------------------- RESET WORKSPACE -------------------- */

$("#resetBtn").addEventListener("click", () => {
    if (!confirm("Reset the workspace to its original state?")) return;

    const original = `
        <div class="canvas-title">
            <span class="eyebrow">DESIGN CONCEPT / 2026</span>
            <h2>Creative Thinking</h2>
            <p>Every great idea begins with a different perspective.</p>
        </div>

        <div class="canvas-object text-object" data-type="text"
             data-id="text-1" tabindex="0" style="left:30px;top:155px">
            <div class="object-content" contenteditable="false">
                <h3>Think beyond limits.</h3>
                <p>Select this text to reveal typography tools.</p>
            </div>
        </div>

        <div class="canvas-object image-object" data-type="image"
             data-id="image-1" tabindex="0" style="left:35px;top:260px">
            <div class="image-placeholder">
                <span class="image-symbol">▧</span>
                <b>Visual Concept</b>
                <small>Illustration placeholder</small>
            </div>
        </div>

        <div class="canvas-object shape-object" data-type="shape"
             data-id="shape-1" tabindex="0" style="left:265px;top:180px">
            <div class="shape-inner"></div>
        </div>

        <div class="canvas-object table-object" data-type="table"
             data-id="table-1" tabindex="0" style="left:265px;top:300px">
            <table>
                <thead><tr><th>Task</th><th>Status</th></tr></thead>
                <tbody>
                    <tr><td>Research</td><td>Done</td></tr>
                    <tr><td>Design</td><td>In progress</td></tr>
                </tbody>
            </table>
        </div>

        <div class="canvas-object video-object" data-type="video"
             data-id="video-1" tabindex="0" style="left:450px;top:175px">
            <div class="video-placeholder">
                <button class="play-symbol" tabindex="-1">▶</button>
                <b>Video Preview</b>
                <small>Demo media object</small>
            </div>
        </div>
    `;

    undoStack = [];
    redoStack = [];
    selectedIds.clear();
    nextId = 2;
    zoom = 100;

    canvas.innerHTML = original;

    renderSelection();
    applyZoom();
    updateUndoRedoButtons();

    logInteraction("Workspace reset", "Restored the default canvas");
    showToast("Workspace reset successfully");
});

/* -------------------- EXPORT ANALYTICS -------------------- */

$("#exportAnalytics").addEventListener("click", () => {
    const headers = ["Timestamp", "Action", "Details", "Error"];

    const rows = activityHistory.map(entry => [
        entry.time,
        entry.action,
        entry.detail,
        entry.error ? "Yes" : "No"
    ]);

    const csvCell = value =>
        `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [headers, ...rows]
        .map(row => row.map(csvCell).join(","))
        .join("\r\n");

    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "adaptive-toolbar-activity.csv";
    link.click();

    URL.revokeObjectURL(url);

    logInteraction("Analytics exported", "Downloaded activity CSV");
    showToast("Activity report exported");
});

/* -------------------- CLEAR ACTIVITY -------------------- */

$("#clearActivity").addEventListener("click", () => {
    if (!activityHistory.length) {
        showToast("There is no activity to clear.");
        return;
    }

    activityHistory = [];
    renderActivity();

    showToast("Activity feed cleared");
});

/* -------------------- KEYBOARD SHORTCUTS -------------------- */

document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;

    const active = document.activeElement;

    const isTyping = active &&
        (active.isContentEditable ||
         ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName));

    if (modifier && key === "s") {
        event.preventDefault();
        exportWorkspace();
        return;
    }

    if (isTyping && !(modifier && ["b", "i"].includes(key))) {
        return;
    }

    if (modifier && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
    }

    if (
        (modifier && key === "y") ||
        (modifier && event.shiftKey && key === "z")
    ) {
        event.preventDefault();
        redo();
        return;
    }

    if (modifier && key === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
    }

    if (modifier && key === "b") {
        event.preventDefault();
        executeAction("bold");
        return;
    }

    if (modifier && key === "i") {
        event.preventDefault();
        executeAction("italic");
        return;
    }

    if (event.key === "Escape") {
        deselectAll();
        return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
        if (!isTyping && selectedIds.size) {
            event.preventDefault();
            deleteSelected();
        }
    }
});

/* -------------------- SAVE / EXPORT WORKSPACE -------------------- */

function exportWorkspace() {
    const workspace = {
        application: "Adaptive Studio",
        experiment: "HCI Experiment 12",
        exportedAt: new Date().toISOString(),
        zoom,
        objects: getObjects().map(object => ({
            id: object.dataset.id,
            type: object.dataset.type,
            name: object.dataset.name || getObjectLabel(object),
            x: parseFloat(object.style.left) || 0,
            y: parseFloat(object.style.top) || 0,
            width: object.offsetWidth,
            height: object.offsetHeight,
            rotation: object.dataset.rotation || 0,
            opacity: object.dataset.opacity || 100,
            html: object.innerHTML
        }))
    };

    const blob = new Blob(
        [JSON.stringify(workspace, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "adaptive-studio-workspace.json";
    link.click();

    URL.revokeObjectURL(url);

    logInteraction("Workspace exported", "Downloaded JSON workspace");
    showToast("Workspace JSON exported");
}

/* -------------------- INITIALIZATION -------------------- */

function initialize() {
    applyZoom();
    renderSelection();
    renderToolbar();
    renderProperties();
    renderActivity();
    updateAnalytics();
    updateUndoRedoButtons();

    showToast("Adaptive Studio is ready. Select an object to begin.");

    console.log("Adaptive Studio initialized successfully.");
}

initialize();