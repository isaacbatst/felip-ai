# Default Templates as Suggestions — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show default templates as clickable suggestions when adding custom templates, instead of hiding them.

**Architecture:** Frontend-only changes to the Alpine.js dashboard. New state for a template chooser inline UI, new methods to open/close it and pre-fill the editor from defaults. Remove "Voltar aos padrões" button and move "Criar meus próprios templates" button above the defaults list.

**Tech Stack:** Alpine.js, Tailwind CSS, HTML

**Spec:** `docs/superpowers/specs/2026-03-12-default-templates-as-suggestions-design.md`

---

## Chunk 1: All Changes

All changes are in a single file: `nest_api/public/dashboard.html`

### Task 1: Add new Alpine.js state and methods

**Files:**
- Modify: `nest_api/public/dashboard.html:1566-1569` (state) and `:1908-1921` (methods)

- [ ] **Step 1: Add new state properties**

After line 1569 (`savingTemplate: false,`), add:

```js
showTemplateChooser: false,
templateChooserType: null,
```

- [ ] **Step 2: Add new methods**

After the `cancelEditTemplate()` method (line 1921), add:

```js
openTemplateChooser(type) {
  this.cancelEditTemplate();
  this.showTemplateChooser = true;
  this.templateChooserType = type;
},

closeTemplateChooser() {
  this.showTemplateChooser = false;
  this.templateChooserType = null;
},

startBlankTemplate(type) {
  this.closeTemplateChooser();
  this.startNewTemplate(type);
},

startFromDefault(type, defaultTemplate) {
  this.closeTemplateChooser();
  this.startNewTemplate(type);
  this.editingTemplate.body = defaultTemplate.preview;
  this.updateTemplatePreview();
},
```

- [ ] **Step 3: Remove `resetToDefaults` and `deleteAllTemplates` methods**

Delete the `resetToDefaults` method (lines 1993-2004) — no longer used since "Voltar aos padrões" is removed:

```js
        async resetToDefaults(type) {
          if (!confirm('Isso excluirá todos os seus templates customizados deste tipo. Deseja continuar?')) return;
          const result = await this.deleteAllTemplates(type);
          if (result.success) {
            if (type === 'counter_offer') {
              this.customCounterOfferTemplates = [];
            } else {
              this.customCtaTemplates = [];
            }
            this.showToast('Templates customizados removidos!', 'success');
          }
        },
```

Also delete the `deleteAllTemplates` method (lines 1901-1906) — only called by `resetToDefaults`:

```js
        async deleteAllTemplates(type) {
          const res = await this.authFetch(`/dashboard/message-templates?type=${type}`, {
            method: 'DELETE',
          });
          return await res.json();
        },
```

- [ ] **Step 4: Close chooser on sub-tab switch**

Find where `proposalSubTab` is set (the sub-tab buttons in the HTML). Add `closeTemplateChooser()` call alongside each sub-tab switch. Search for `proposalSubTab =` in the HTML and add `closeTemplateChooser();` before each assignment.

Alternatively, add a watcher-like approach: in `openTemplateChooser`, no change needed since the chooser is already conditioned on `templateChooserType` matching the correct type. Since each section uses `x-show="proposalSubTab === '...'"`, switching tabs naturally hides the chooser visually. The state persists but is harmless since it's behind the `x-show` parent. No code change needed — just noting this is already handled by the existing `x-show` hierarchy.

- [ ] **Step 5: Commit**

```bash
git add nest_api/public/dashboard.html
git commit -m "feat(LF-52): add template chooser state and methods"
```

---

### Task 2: Update Counter Offer section — no custom templates state

**Files:**
- Modify: `nest_api/public/dashboard.html`

Two separate edits (these are in different parent containers):

- [ ] **Step 1: Add "Criar meus próprios templates" button inside the defaults block**

Inside the `<template x-if="getCustomTemplates('counter_offer').length === 0">` block (line 403), add the button **after** the `<div class="data-card-header mb-3">` closing `</div>` (line 408) and **before** the `<div class="flex flex-col gap-3">` (line 409):

```html
            <template x-if="!editingTemplate">
              <button type="button"
                class="w-full mb-4 py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer bg-transparent"
                @click="startNewTemplate('counter_offer')">
                Criar meus próprios templates
              </button>
            </template>
```

- [ ] **Step 2: Remove the standalone "Criar meus próprios templates" button from the Custom Templates Section**

Delete lines 433-442 (the `<template x-if="getCustomTemplates('counter_offer').length === 0 && !editingTemplate">` block with the button inside the Custom Templates Section `<div>`):

```html
          <!-- If no custom templates: show button to start -->
          <template x-if="getCustomTemplates('counter_offer').length === 0 && !editingTemplate">
            <div>
              <button type="button"
                class="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer bg-transparent"
                @click="startNewTemplate('counter_offer')">
                Criar meus próprios templates
              </button>
            </div>
          </template>
```

- [ ] **Step 3: Commit**

```bash
git add nest_api/public/dashboard.html
git commit -m "feat(LF-52): move create-custom button above defaults for counter offer"
```

---

### Task 3: Update Counter Offer section — has custom templates state

**Files:**
- Modify: `nest_api/public/dashboard.html:445-489` (custom templates list)

- [ ] **Step 1: Remove "Voltar aos padrões" button and update "+ Adicionar" to use chooser**

Replace the custom templates section (the `x-if="getCustomTemplates('counter_offer').length > 0"` block) with:

```html
          <template x-if="getCustomTemplates('counter_offer').length > 0">
            <div>
              <div class="flex items-center justify-between mb-3">
                <h4 class="font-semibold text-sm text-gray-800">Meus Templates</h4>
              </div>

              <p x-show="getActiveTemplateCount('counter_offer') > 1" class="text-xs text-gray-400 mb-3">
                O bot escolhera aleatoriamente entre os <span x-text="getActiveTemplateCount('counter_offer')"></span> templates ativos
              </p>

              <div class="flex flex-col gap-3">
                <template x-for="template in customCounterOfferTemplates" :key="template.id">
                  <div class="p-3 border rounded-lg transition-all"
                    :class="template.isActive ? 'border-primary bg-primary/5' : 'border-gray-200 opacity-60'">
                    <div class="flex items-start justify-between gap-2">
                      <pre class="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-2 rounded flex-1 m-0" x-text="template.body"></pre>
                      <div class="flex items-center gap-2 shrink-0">
                        <label class="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" class="sr-only peer" :checked="template.isActive"
                            @change="toggleTemplateActive(template)">
                          <div class="w-9 h-5 bg-gray-200 peer-checked:bg-primary rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                        </label>
                        <button type="button" class="text-gray-400 hover:text-primary text-xs cursor-pointer bg-transparent border-none"
                          @click="startEditTemplate(template)">Editar</button>
                        <button type="button" class="text-gray-400 hover:text-red-500 text-xs cursor-pointer bg-transparent border-none"
                          @click="removeTemplate(template)">Excluir</button>
                      </div>
                    </div>
                  </div>
                </template>
              </div>

              <button type="button"
                class="w-full mt-3 py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="customCounterOfferTemplates.length >= 5"
                @click="openTemplateChooser('counter_offer')">
                + Adicionar template
                <span x-show="customCounterOfferTemplates.length >= 5" class="text-xs">(maximo atingido)</span>
              </button>
            </div>
          </template>
```

Key changes from original:
- Removed "Voltar aos padrões" button from the header `div`
- Changed `@click="startNewTemplate('counter_offer')"` to `@click="openTemplateChooser('counter_offer')"` on the "+ Adicionar" button

- [ ] **Step 2: Commit**

```bash
git add nest_api/public/dashboard.html
git commit -m "feat(LF-52): remove voltar-aos-padroes, wire up chooser for counter offer"
```

---

### Task 4: Add template chooser UI for Counter Offer

**Files:**
- Modify: `nest_api/public/dashboard.html` — insert new block between custom templates list and the editor template

- [ ] **Step 1: Add chooser HTML**

Insert right before the `<!-- Template Editor (inline) for Counter Offer -->` comment (currently around line 491):

```html
          <!-- Template Chooser (Counter Offer) -->
          <template x-if="showTemplateChooser && templateChooserType === 'counter_offer'">
            <div class="mt-3 p-4 border border-gray-200 rounded-xl bg-gray-50/50">
              <div class="flex items-center justify-between mb-3">
                <h5 class="font-semibold text-sm text-gray-800">Escolha uma base</h5>
                <button type="button" class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer bg-transparent border-none"
                  @click="closeTemplateChooser()">Cancelar</button>
              </div>

              <div class="flex flex-col gap-2">
                <button type="button"
                  class="w-full text-left py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer bg-white"
                  @click="startBlankTemplate('counter_offer')">
                  <i class="fa-solid fa-file-circle-plus mr-2 opacity-60"></i>Em branco
                </button>

                <template x-for="tpl in counterOfferTemplates" :key="tpl.id">
                  <button type="button"
                    class="w-full text-left p-3 border border-gray-200 rounded-lg bg-white hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                    @click="startFromDefault('counter_offer', tpl)">
                    <div class="flex items-start gap-2">
                      <i class="fa-solid fa-copy text-gray-300 group-hover:text-primary/60 mt-0.5 text-xs transition-colors"></i>
                      <div class="flex-1 min-w-0">
                        <div class="font-medium text-xs text-gray-600 group-hover:text-gray-800 mb-1 transition-colors" x-text="tpl.description"></div>
                        <pre class="text-xs text-gray-400 whitespace-pre-wrap m-0 line-clamp-3" x-text="tpl.preview"></pre>
                      </div>
                    </div>
                  </button>
                </template>
              </div>
            </div>
          </template>
```

- [ ] **Step 2: Commit**

```bash
git add nest_api/public/dashboard.html
git commit -m "feat(LF-52): add template chooser UI for counter offer"
```

---

### Task 5: Update CTA section — no custom templates state

**Files:**
- Modify: `nest_api/public/dashboard.html`

Same pattern as Task 2 — two separate edits in different parent containers:

- [ ] **Step 1: Add "Criar meus próprios templates" button inside the CTA defaults block**

Inside the `<template x-if="getCustomTemplates('cta').length === 0">` block (line 540), add the button after the `<div class="data-card-header mb-3">` closing `</div>` (line 545) and before the `<div class="flex flex-col gap-3">` (line 546):

```html
            <template x-if="!editingTemplate">
              <button type="button"
                class="w-full mb-4 py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer bg-transparent"
                @click="startNewTemplate('cta')">
                Criar meus próprios templates
              </button>
            </template>
```

- [ ] **Step 2: Remove the standalone "Criar meus próprios templates" button from the CTA Custom Templates Section**

Delete lines 570-579 (the `<template x-if="getCustomTemplates('cta').length === 0 && !editingTemplate">` block inside the CTA Custom Templates Section `<div>`):

```html
          <!-- If no custom templates: show button to start -->
          <template x-if="getCustomTemplates('cta').length === 0 && !editingTemplate">
            <div>
              <button type="button"
                class="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer bg-transparent"
                @click="startNewTemplate('cta')">
                Criar meus próprios templates
              </button>
            </div>
          </template>
```

- [ ] **Step 3: Commit**

```bash
git add nest_api/public/dashboard.html
git commit -m "feat(LF-52): move create-custom button above defaults for CTA"
```

---

### Task 6: Update CTA section — has custom templates state

**Files:**
- Modify: `nest_api/public/dashboard.html:582-626`

- [ ] **Step 1: Remove "Voltar aos padrões" and wire up chooser**

Same pattern as Task 3. Replace the CTA custom list block (`x-if="getCustomTemplates('cta').length > 0"`) with:

```html
          <template x-if="getCustomTemplates('cta').length > 0">
            <div>
              <div class="flex items-center justify-between mb-3">
                <h4 class="font-semibold text-sm text-gray-800">Meus Templates</h4>
              </div>

              <p x-show="getActiveTemplateCount('cta') > 1" class="text-xs text-gray-400 mb-3">
                O bot escolhera aleatoriamente entre os <span x-text="getActiveTemplateCount('cta')"></span> templates ativos
              </p>

              <div class="flex flex-col gap-3">
                <template x-for="template in customCtaTemplates" :key="template.id">
                  <div class="p-3 border rounded-lg transition-all"
                    :class="template.isActive ? 'border-primary bg-primary/5' : 'border-gray-200 opacity-60'">
                    <div class="flex items-start justify-between gap-2">
                      <pre class="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-2 rounded flex-1 m-0" x-text="template.body"></pre>
                      <div class="flex items-center gap-2 shrink-0">
                        <label class="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" class="sr-only peer" :checked="template.isActive"
                            @change="toggleTemplateActive(template)">
                          <div class="w-9 h-5 bg-gray-200 peer-checked:bg-primary rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                        </label>
                        <button type="button" class="text-gray-400 hover:text-primary text-xs cursor-pointer bg-transparent border-none"
                          @click="startEditTemplate(template)">Editar</button>
                        <button type="button" class="text-gray-400 hover:text-red-500 text-xs cursor-pointer bg-transparent border-none"
                          @click="removeTemplate(template)">Excluir</button>
                      </div>
                    </div>
                  </div>
                </template>
              </div>

              <button type="button"
                class="w-full mt-3 py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="customCtaTemplates.length >= 5"
                @click="openTemplateChooser('cta')">
                + Adicionar template
                <span x-show="customCtaTemplates.length >= 5" class="text-xs">(maximo atingido)</span>
              </button>
            </div>
          </template>
```

- [ ] **Step 2: Commit**

```bash
git add nest_api/public/dashboard.html
git commit -m "feat(LF-52): remove voltar-aos-padroes, wire up chooser for CTA"
```

---

### Task 7: Add template chooser UI for CTA

**Files:**
- Modify: `nest_api/public/dashboard.html` — insert before `<!-- Template Editor (inline) for CTA -->` comment

- [ ] **Step 1: Add chooser HTML for CTA**

Insert right before the CTA editor template block:

```html
          <!-- Template Chooser (CTA) -->
          <template x-if="showTemplateChooser && templateChooserType === 'cta'">
            <div class="mt-3 p-4 border border-gray-200 rounded-xl bg-gray-50/50">
              <div class="flex items-center justify-between mb-3">
                <h5 class="font-semibold text-sm text-gray-800">Escolha uma base</h5>
                <button type="button" class="text-xs text-gray-400 hover:text-gray-600 cursor-pointer bg-transparent border-none"
                  @click="closeTemplateChooser()">Cancelar</button>
              </div>

              <div class="flex flex-col gap-2">
                <button type="button"
                  class="w-full text-left py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-all cursor-pointer bg-white"
                  @click="startBlankTemplate('cta')">
                  <i class="fa-solid fa-file-circle-plus mr-2 opacity-60"></i>Em branco
                </button>

                <template x-for="tpl in callToActionTemplates" :key="tpl.id">
                  <button type="button"
                    class="w-full text-left p-3 border border-gray-200 rounded-lg bg-white hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                    @click="startFromDefault('cta', tpl)">
                    <div class="flex items-start gap-2">
                      <i class="fa-solid fa-copy text-gray-300 group-hover:text-primary/60 mt-0.5 text-xs transition-colors"></i>
                      <div class="flex-1 min-w-0">
                        <div class="font-medium text-xs text-gray-600 group-hover:text-gray-800 mb-1 transition-colors" x-text="tpl.description"></div>
                        <pre class="text-xs text-gray-400 whitespace-pre-wrap m-0 line-clamp-3" x-text="tpl.preview"></pre>
                      </div>
                    </div>
                  </button>
                </template>
              </div>
            </div>
          </template>
```

- [ ] **Step 2: Commit**

```bash
git add nest_api/public/dashboard.html
git commit -m "feat(LF-52): add template chooser UI for CTA"
```

---

### Task 8: Manual testing

- [ ] **Step 1: Test no-custom-templates state**

1. Open dashboard with no custom templates
2. Verify "Criar meus próprios templates" button appears **above** the default radio buttons
3. Verify radio buttons still work for selecting default templates
4. Click "Criar meus próprios templates" — editor opens blank

- [ ] **Step 2: Test custom-templates state — chooser flow**

1. Create at least 1 custom template
2. Verify "Voltar aos padrões" button is gone
3. Click "+ Adicionar template"
4. Verify chooser appears with "Em branco" + default templates as cards
5. Click "Cancelar" — chooser closes
6. Click "+ Adicionar template" again, pick "Em branco" — editor opens empty
7. Cancel, click "+ Adicionar" again, pick a default template — editor opens pre-filled with that template's preview text

- [ ] **Step 3: Test for both Counter Offer and CTA tabs**

Repeat Steps 1-2 for both sub-tabs.

- [ ] **Step 4: Test edge cases**

1. With editor open, verify "+ Adicionar template" closes editor and opens chooser
2. With 5 custom templates, verify "+ Adicionar" button is disabled
3. Delete all custom templates one by one — UI returns to radio button mode
