/*
 * Script Name: Group Color Map
 * Version: v2.0.0
 * Descrição: Pinta o território de cada grupo no mapa usando convex hull
 *            com overlay SVG semi-transparente.
 */

(function () {
    'use strict';

    const SCRIPT_NAME    = 'Group Color Map';
    const KEY_COLORS     = 'gcm_groupColors';
    const KEY_VGROUPS    = 'gcm_villageGroups';
    const KEY_TS         = 'gcm_villageGroups_ts';
    const CACHE_TTL      = 60 * 60 * 1000;
    const MAX_PAGES      = 100;
    const DELAY_MS       = 200;
    const HULL_PAD       = 20;
    const FILL_OPACITY   = 0.28;
    const STROKE_OPACITY = 0.7;

    const PALETTE = [
        { label: 'Padrão (sem cor)', value: ''        },
        { label: 'Vermelho',         value: '#e74c3c'  },
        { label: 'Laranja',          value: '#e67e22'  },
        { label: 'Amarelo',          value: '#f1c40f'  },
        { label: 'Verde Escuro',     value: '#1e8449'  },
        { label: 'Verde',            value: '#27ae60'  },
        { label: 'Azul Escuro',      value: '#1a5276'  },
        { label: 'Azul',             value: '#2980b9'  },
        { label: 'Ciano',            value: '#17a589'  },
        { label: 'Roxo',             value: '#8e44ad'  },
        { label: 'Rosa',             value: '#e91e8c'  },
        { label: 'Branco',           value: '#ecf0f1'  },
        { label: 'Cinza',            value: '#95a5a6'  },
        { label: 'Preto',            value: '#2c3e50'  },
    ];

    let groupColors     = {};
    let villageGroupMap = {};
    let groups          = [];

    // ── Redirect ──────────────────────────────────────────────────────────────

    if (game_data.screen !== 'map') {
        UI.InfoMessage(`${SCRIPT_NAME}: redirecionando...`);
        window.location.assign(game_data.link_base_pure + 'map');
        return;
    }

    init();

    // ── Init ─────────────────────────────────────────────────────────────────

    async function init() {
        try {
            groupColors = JSON.parse(localStorage.getItem(KEY_COLORS) || '{}');
            UI.InfoMessage(`${SCRIPT_NAME}: carregando grupos...`);
            groups = await fetchGroups();
            await loadVillageGroupMap();
            createSVGOverlay();
            drawTerritories();
            hookMapMove();
            buildUI();
        } catch (err) {
            UI.ErrorMessage(`${SCRIPT_NAME}: erro ao inicializar!`);
            console.error(`[${SCRIPT_NAME}]`, err);
        }
    }

    // ── Data ─────────────────────────────────────────────────────────────────

    function fetchGroups() {
        return $.get(TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' }))
            .then(d => (d.result || []).filter(g => g.type !== 'separator' && g.group_id != 0));
    }

    async function loadVillageGroupMap() {
        const ts     = parseInt(localStorage.getItem(KEY_TS) || '0');
        const cached = localStorage.getItem(KEY_VGROUPS);
        if (cached && (Date.now() - ts) < CACHE_TTL) {
            villageGroupMap = JSON.parse(cached);
            return;
        }
        villageGroupMap = {};
        for (let i = 0; i < groups.length; i++) {
            await fetchGroupVillages(groups[i].group_id);
            if (i < groups.length - 1) await sleep(DELAY_MS);
        }
        localStorage.setItem(KEY_VGROUPS, JSON.stringify(villageGroupMap));
        localStorage.setItem(KEY_TS, String(Date.now()));
    }

    async function fetchGroupVillages(groupId) {
        for (let page = 0; page <= MAX_PAGES; page++) {
            const html  = await $.get(TribalWars.buildURL('GET', 'overview_villages', {
                mode: 'combined', group: groupId, page,
            }));
            const $html = $(html);
            const els   = $html.find('.quickedit-vn[data-id]');
            if (els.length === 0) break;
            els.each(function () {
                const vid    = String($(this).data('id'));
                const gidStr = String(groupId);
                if (!vid) return;
                if (!villageGroupMap[vid]) villageGroupMap[vid] = [];
                if (!villageGroupMap[vid].includes(gidStr)) villageGroupMap[vid].push(gidStr);
            });
            if (!$html.find(`.paged-nav-item[href*="page=${page + 1}"]`).length) break;
            await sleep(DELAY_MS);
        }
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ── SVG Overlay ───────────────────────────────────────────────────────────

    function createSVGOverlay() {
        if (document.getElementById('gcm_svg')) return;
        const mapEl = document.getElementById('map');
        if (!mapEl) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'gcm_svg';
        svg.style.cssText = `
            position:absolute;top:0;left:0;
            width:100%;height:100%;
            pointer-events:none;z-index:3;overflow:visible;
        `;
        mapEl.style.position = mapEl.style.position || 'relative';
        mapEl.appendChild(svg);
    }

    /**
     * Converte coordenada TW (cx, cy) → pixel relativo ao viewport do mapa.
     * coordByPixel retorna um array [x, y].
     */
    function coordToPixel(cx, cy) {
        const origin = TWMap.map.coordByPixel(TWMap.map.pos[0], TWMap.map.pos[1]);
        if (!origin) return null;
        return {
            x: (parseInt(cx) - parseInt(origin[0])) * TWMap.tileSize[0] + TWMap.tileSize[0] / 2,
            y: (parseInt(cy) - parseInt(origin[1])) * TWMap.tileSize[1] + TWMap.tileSize[1] / 2,
        };
    }

    /** Agrupa posições em pixels por group_id */
    function buildGroupPixelPoints() {
        const groupPoints = {};
        for (const key in TWMap.villages) {
            const v    = TWMap.villages[key];
            const gids = villageGroupMap[String(v.id)] || [];
            if (!gids.length) continue;

            // Primeiro grupo com cor definida vence
            let chosenGid = null;
            for (const gid of gids) {
                if (groupColors[String(gid)]) { chosenGid = gid; break; }
            }
            if (!chosenGid) continue;

            // Extrai coord a partir da chave numérica (cx*1000+cy)
            const num = parseInt(key);
            const tcy = num % 1000;
            const tcx = Math.floor(num / 1000);
            const px  = coordToPixel(tcx, tcy);
            if (!px) continue;

            if (!groupPoints[chosenGid]) groupPoints[chosenGid] = [];
            groupPoints[chosenGid].push(px);
        }
        return groupPoints;
    }

    function drawTerritories() {
        const svg = document.getElementById('gcm_svg');
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        const groupPoints = buildGroupPixelPoints();

        for (const gid in groupPoints) {
            const color  = groupColors[String(gid)];
            if (!color) continue;
            const points = groupPoints[gid];
            if (!points.length) continue;

            const pathD = buildTerritoryPath(points);
            if (!pathD) continue;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathD);
            path.setAttribute('fill', color);
            path.setAttribute('fill-opacity', String(FILL_OPACITY));
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-opacity', String(STROKE_OPACITY));
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('stroke-linecap', 'round');
            svg.appendChild(path);
        }
    }

    // ── Geometria ─────────────────────────────────────────────────────────────

    function buildTerritoryPath(points) {
        const tileR = TWMap.tileSize[0] / 2;
        const pad   = HULL_PAD + tileR;

        if (points.length === 1) {
            const p = points[0], r = pad * 2;
            return `M${p.x - r},${p.y} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
        }

        const hull    = points.length === 2 ? points : convexHull(points);
        const expanded = expandHull(hull, pad);
        const smooth   = chaikin(chaikin(expanded)); // 2 passes de suavização
        return 'M ' + smooth.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ') + ' Z';
    }

    /** Andrew's monotone chain — O(n log n) */
    function convexHull(pts) {
        if (pts.length <= 2) return pts;
        const s     = [...pts].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
        const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
        const lower = [], upper = [];
        for (const p of s) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        for (let i = s.length - 1; i >= 0; i--) {
            const p = s[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        upper.pop(); lower.pop();
        return lower.concat(upper);
    }

    /** Expande cada vértice do hull para fora do centroide */
    function expandHull(hull, padding) {
        const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
        const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
        return hull.map(p => {
            const dx = p.x - cx, dy = p.y - cy;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
        });
    }

    /** Chaikin corner-cutting — suaviza o polígono */
    function chaikin(pts) {
        if (pts.length < 3) return pts;
        const out = [], n = pts.length;
        for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % n];
            out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
            out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        }
        return out;
    }

    // ── Hook de movimento ─────────────────────────────────────────────────────

    function hookMapMove() {
        if (!TWMap.mapHandler._gcm_origMove) {
            TWMap.mapHandler._gcm_origMove = TWMap.mapHandler.onMove;
        }
        TWMap.mapHandler.onMove = function (x, y) {
            if (TWMap.mapHandler._gcm_origMove) TWMap.mapHandler._gcm_origMove(x, y);
            drawTerritories();
        };
    }

    function restoreMapMove() {
        if (TWMap.mapHandler._gcm_origMove) {
            TWMap.mapHandler.onMove = TWMap.mapHandler._gcm_origMove;
            delete TWMap.mapHandler._gcm_origMove;
        }
    }

    // ── UI ────────────────────────────────────────────────────────────────────

    function buildUI() {
        const rows = groups.map(g => {
            const saved = groupColors[String(g.group_id)] || '';
            const opts  = PALETTE.map(c => {
                return `<option value="${c.value}" ${c.value === saved ? 'selected' : ''}>${c.label}</option>`;
            }).join('');
            const dotCss = saved
                ? `background:${saved};border:1px solid #555;`
                : `background:transparent;border:1px dashed #bbb;`;
            return `
                <tr>
                    <td style="padding:6px 10px;vertical-align:middle;">
                        <span id="gcm_dot_${g.group_id}" style="
                            display:inline-block;width:14px;height:14px;
                            border-radius:3px;vertical-align:middle;
                            margin-right:7px;${dotCss}"></span>
                        <strong>${escapeHtml(g.name)}</strong>
                    </td>
                    <td style="padding:6px 10px;">
                        <select class="gcm_sel" data-gid="${g.group_id}"
                            onchange="gcmPreview(this)" style="width:100%;">
                            ${opts}
                        </select>
                    </td>
                </tr>`;
        }).join('');

        Dialog.show('gcm', `
            <style>
                #popup_box_gcm { width:460px !important; }
                .gcm-wrap { font-size:13px; }
                .gcm-title { font-size:15px;font-weight:bold;margin-bottom:10px;color:#6b3a10; }
                .gcm-table { width:100%;border-collapse:collapse;margin-bottom:10px; }
                .gcm-table th { background:#c1a264;color:#3d1c00;padding:6px 10px;text-align:left; }
                .gcm-table tr:nth-child(odd)  td { background:#fff5da; }
                .gcm-table tr:nth-child(even) td { background:#f0e2be; }
                .gcm-actions { text-align:center;margin-top:4px; }
                .gcm-actions input { margin:3px 4px; }
                .gcm-hint { font-size:11px;color:#888;text-align:center;margin-top:8px; }
            </style>
            <div class="gcm-wrap">
                <div class="gcm-title">🗺️ ${SCRIPT_NAME}</div>
                <table class="vis gcm-table">
                    <thead><tr><th>Grupo</th><th>Cor do Território</th></tr></thead>
                    <tbody>${groups.length ? rows : '<tr><td colspan="2" style="text-align:center;padding:10px;color:#888;">Nenhum grupo encontrado.</td></tr>'}</tbody>
                </table>
                <div class="gcm-actions">
                    <input type="button" class="btn btn-confirm-yes" id="gcm_btn_save"    value="💾 Salvar e Aplicar">
                    <input type="button" class="btn"                 id="gcm_btn_reset"   value="🔄 Limpar Mapa">
                    <input type="button" class="btn"                 id="gcm_btn_refresh" value="↺ Recarregar Grupos">
                </div>
                <div class="gcm-hint">
                    Cache: 1h &nbsp;|&nbsp; Opacidade: ${Math.round(FILL_OPACITY * 100)}%
                    &nbsp;|&nbsp; Aldeia em múltiplos grupos: 1º com cor vence
                </div>
            </div>`);

        window.gcmPreview = function (sel) {
            const dot = document.getElementById('gcm_dot_' + sel.dataset.gid);
            if (dot) {
                dot.style.background = sel.value || 'transparent';
                dot.style.border     = sel.value ? '1px solid #555' : '1px dashed #bbb';
            }
        };

        document.getElementById('gcm_btn_save').addEventListener('click', onSave);
        document.getElementById('gcm_btn_reset').addEventListener('click', onReset);
        document.getElementById('gcm_btn_refresh').addEventListener('click', onRefresh);
    }

    function onSave() {
        document.querySelectorAll('.gcm_sel').forEach(sel => {
            const gid = String(sel.dataset.gid);
            if (sel.value) groupColors[gid] = sel.value;
            else           delete groupColors[gid];
        });
        localStorage.setItem(KEY_COLORS, JSON.stringify(groupColors));
        Dialog.close();
        drawTerritories();
        UI.SuccessMessage(`${SCRIPT_NAME}: territórios aplicados!`);
    }

    function onReset() {
        const svg = document.getElementById('gcm_svg');
        if (svg) svg.remove();
        restoreMapMove();
        Dialog.close();
        UI.InfoMessage(`${SCRIPT_NAME}: mapa resetado.`);
    }

    async function onRefresh() {
        Dialog.close();
        localStorage.removeItem(KEY_VGROUPS);
        localStorage.removeItem(KEY_TS);
        UI.InfoMessage(`${SCRIPT_NAME}: atualizando...`);
        try {
            groups = await fetchGroups();
            await loadVillageGroupMap();
            drawTerritories();
            buildUI();
        } catch (err) {
            UI.ErrorMessage(`${SCRIPT_NAME}: erro!`);
            console.error(`[${SCRIPT_NAME}]`, err);
        }
    }

    // ── Utils ─────────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

})();
