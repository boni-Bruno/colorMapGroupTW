/*
 * Script Name: Group Color Map
 * Version: v1.0.0
 * Author: Bruno (via Claude)
 * Descrição: Colore aldeias no mapa conforme grupo, com UI de configuração.
 *
 * COMO USAR:
 *   javascript: $.getScript('URL_DO_SEU_SCRIPT');
 *   OU cole direto no console do navegador na página do TW.
 */

(function () {
    'use strict';

    // ─── Constantes ────────────────────────────────────────────────────────────

    const SCRIPT_NAME  = 'Group Color Map';
    const KEY_COLORS   = 'gcm_groupColors';
    const KEY_VGROUPS  = 'gcm_villageGroups';
    const KEY_TS       = 'gcm_villageGroups_ts';
    const CACHE_TTL    = 60 * 60 * 1000; // 1 hora em ms
    const MAX_PAGES    = 100;             // segurança contra loop infinito
    const DELAY_MS     = 200;            // delay entre requests (respeita ~5req/s)

    /** Paleta de cores disponíveis no seletor */
    const PALETTE = [
        { label: 'Padrão (sem cor)',  value: ''        },
        { label: 'Vermelho',          value: '#c0392b' },
        { label: 'Laranja',           value: '#d35400' },
        { label: 'Amarelo',           value: '#d4ac0d' },
        { label: 'Verde',             value: '#1e8449' },
        { label: 'Verde Claro',       value: '#52be80' },
        { label: 'Azul',              value: '#1a5276' },
        { label: 'Azul Claro',        value: '#2e86c1' },
        { label: 'Ciano',             value: '#0e7b8a' },
        { label: 'Roxo',              value: '#7d3c98' },
        { label: 'Rosa',              value: '#c0236e' },
        { label: 'Branco',            value: '#ecf0f1' },
        { label: 'Cinza',             value: '#7f8c8d' },
        { label: 'Preto',             value: '#17202a' },
    ];

    // ─── Estado ─────────────────────────────────────────────────────────────────

    let groupColors    = {};   // { groupId: hexColor }
    let villageGroupMap = {};  // { villageId: [groupId, ...] }
    let groups         = [];   // array de { group_id, name }

    // ─── Ponto de entrada ────────────────────────────────────────────────────────

    if (game_data.screen !== 'map') {
        UI.InfoMessage(`${SCRIPT_NAME}: redirecionando para o mapa...`);
        window.location.assign(game_data.link_base_pure + 'map');
        return;
    }

    init();

    async function init() {
        try {
            groupColors = JSON.parse(localStorage.getItem(KEY_COLORS) || '{}');

            UI.InfoMessage(`${SCRIPT_NAME}: carregando grupos...`);
            groups = await fetchGroups();

            await loadVillageGroupMap();

            applyAllColors();
            hookSpawnSector();
            buildUI();

        } catch (err) {
            UI.ErrorMessage(`${SCRIPT_NAME}: erro ao inicializar!`);
            console.error(`[${SCRIPT_NAME}]`, err);
        }
    }

    // ─── Busca de dados ───────────────────────────────────────────────────────────

    /** Retorna lista de grupos do jogador via API interna do TW */
    function fetchGroups() {
        return $.get(
            TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' })
        ).then(data =>
            (data.result || []).filter(g => g.type !== 'separator' && g.group_id != 0)
        );
    }

    /** Carrega mapeamento aldeia→grupos (cache ou fetch) */
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
        localStorage.setItem(KEY_TS,      String(Date.now()));
    }

    /** Faz paginação e extrai IDs de aldeias de um grupo */
    async function fetchGroupVillages(groupId) {
        for (let page = 0; page <= MAX_PAGES; page++) {
            const url  = TribalWars.buildURL('GET', 'overview_villages', {
                mode:  'combined',
                group: groupId,
                page:  page,
            });
            const html = await $.get(url);
            const $html = $(html);
            const els   = $html.find('.quickedit-vn[data-id]');

            if (els.length === 0) break;

            els.each(function () {
                const vid = String($(this).data('id'));
                if (!vid) return;
                if (!villageGroupMap[vid]) villageGroupMap[vid] = [];
                const gidStr = String(groupId);
                if (!villageGroupMap[vid].includes(gidStr)) {
                    villageGroupMap[vid].push(gidStr);
                }
            });

            // verifica se existe próxima página
            const hasNext = $html.find(`.paged-nav-item[href*="page=${page + 1}"]`).length > 0;
            if (!hasNext) break;
            await sleep(DELAY_MS);
        }
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ─── Interface ────────────────────────────────────────────────────────────────

    function buildUI() {
        const rows = groups.map(g => {
            const savedColor = groupColors[String(g.group_id)] || '';
            const optionsHtml = PALETTE.map(c => {
                const sel = c.value === savedColor ? 'selected' : '';
                return `<option value="${c.value}" ${sel}>${c.label}</option>`;
            }).join('');

            const preview = savedColor
                ? `background:${savedColor};border:1px solid #555;`
                : `background:transparent;border:1px dashed #999;`;

            return `
                <tr>
                    <td style="padding:6px 10px;vertical-align:middle;">
                        <span id="gcm_dot_${g.group_id}" style="
                            display:inline-block;width:14px;height:14px;
                            border-radius:3px;vertical-align:middle;
                            margin-right:7px;${preview}
                        "></span>
                        <strong>${escapeHtml(g.name)}</strong>
                    </td>
                    <td style="padding:6px 10px;">
                        <select
                            class="gcm_sel"
                            data-gid="${g.group_id}"
                            onchange="gcmPreview(this)"
                            style="width:100%;">
                            ${optionsHtml}
                        </select>
                    </td>
                </tr>`;
        }).join('');

        const noGroups = groups.length === 0
            ? `<tr><td colspan="2" style="padding:10px;text-align:center;color:#888;">
                   Nenhum grupo encontrado.
               </td></tr>`
            : rows;

        const html = `
            <style>
                #popup_box_gcm        { width: 460px !important; }
                .gcm-wrap             { font-size: 13px; }
                .gcm-title            { font-size: 15px; font-weight: bold; margin-bottom: 10px; color: #6b3a10; }
                .gcm-table            { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                .gcm-table th         { background: #c1a264; color: #3d1c00; padding: 6px 10px; text-align: left; }
                .gcm-table tr:nth-child(odd)  td { background: #fff5da; }
                .gcm-table tr:nth-child(even) td { background: #f0e2be; }
                .gcm-actions          { text-align: center; margin-top: 4px; }
                .gcm-actions input    { margin: 3px 4px; }
                .gcm-hint             { font-size: 11px; color: #888; text-align: center; margin-top: 8px; }
            </style>
            <div class="gcm-wrap">
                <div class="gcm-title">🎨 ${SCRIPT_NAME}</div>
                <table class="vis gcm-table">
                    <thead>
                        <tr>
                            <th>Grupo</th>
                            <th>Cor no Mapa</th>
                        </tr>
                    </thead>
                    <tbody>${noGroups}</tbody>
                </table>
                <div class="gcm-actions">
                    <input type="button" class="btn btn-confirm-yes" id="gcm_btn_save"    value="💾 Salvar e Aplicar">
                    <input type="button" class="btn"                 id="gcm_btn_reset"   value="🔄 Limpar Mapa">
                    <input type="button" class="btn"                 id="gcm_btn_refresh" value="↺ Recarregar Grupos">
                </div>
                <div class="gcm-hint">
                    Cache de aldeias: 1h &nbsp;|&nbsp;
                    Aldeias em múltiplos grupos: 1º grupo com cor vence.
                </div>
            </div>`;

        Dialog.show('gcm', html);

        // helpers inline para onchange (escopo global temporário)
        window.gcmPreview = function (sel) {
            const gid   = sel.dataset.gid;
            const color = sel.value;
            const dot   = document.getElementById('gcm_dot_' + gid);
            if (dot) {
                dot.style.background    = color || 'transparent';
                dot.style.border        = color ? `1px solid #555` : `1px dashed #999`;
            }
        };

        document.getElementById('gcm_btn_save').addEventListener('click', onSave);
        document.getElementById('gcm_btn_reset').addEventListener('click', onReset);
        document.getElementById('gcm_btn_refresh').addEventListener('click', onRefresh);
    }

    function onSave() {
        document.querySelectorAll('.gcm_sel').forEach(sel => {
            const gid   = String(sel.dataset.gid);
            const color = sel.value;
            if (color) groupColors[gid] = color;
            else        delete groupColors[gid];
        });

        localStorage.setItem(KEY_COLORS, JSON.stringify(groupColors));
        Dialog.close();
        applyAllColors();
        UI.SuccessMessage(`${SCRIPT_NAME}: cores aplicadas!`);
    }

    function onReset() {
        removeAllOverlays();
        restoreSpawnSector();
        TWMap.reload();
        Dialog.close();
        UI.InfoMessage(`${SCRIPT_NAME}: mapa resetado.`);
    }

    async function onRefresh() {
        Dialog.close();
        localStorage.removeItem(KEY_VGROUPS);
        localStorage.removeItem(KEY_TS);
        UI.InfoMessage(`${SCRIPT_NAME}: atualizando grupos...`);
        try {
            groups = await fetchGroups();
            await loadVillageGroupMap();
            applyAllColors();
            buildUI();
        } catch (err) {
            UI.ErrorMessage(`${SCRIPT_NAME}: erro ao atualizar!`);
            console.error(`[${SCRIPT_NAME}]`, err);
        }
    }

    // ─── Coloração do mapa ────────────────────────────────────────────────────────

    /** Retorna a cor atribuída a uma aldeia (primeiro grupo com cor vence) */
    function getVillageColor(villageId) {
        const gids = villageGroupMap[String(villageId)] || [];
        for (const gid of gids) {
            const color = groupColors[String(gid)];
            if (color) return color;
        }
        return null;
    }

    /** Injeta ou atualiza a barra colorida sobre o tile da aldeia */
    function applyColorToTile(village) {
        const color  = getVillageColor(village.id);
        const tileEl = document.getElementById('map_village_' + village.id);
        if (!tileEl) return;

        const overlayId = 'gcm_tile_' + village.id;
        let overlay     = document.getElementById(overlayId);

        if (!color) {
            if (overlay) overlay.remove();
            return;
        }

        if (!overlay) {
            overlay    = document.createElement('div');
            overlay.id = overlayId;
            tileEl.parentNode.insertBefore(overlay, tileEl.nextSibling);
        }

        overlay.style.cssText = `
            position:${tileEl.style.position};
            left:${tileEl.style.left};
            top:${parseInt(tileEl.style.top, 10) + 20}px;
            width:${TWMap.tileSize[0] - 2}px;
            height:5px;
            background-color:${color};
            opacity:0.9;
            z-index:4;
            border-radius:2px;
            pointer-events:none;
        `;
    }

    /** Aplica cores a todas as aldeias visíveis no momento */
    function applyAllColors() {
        removeAllOverlays();
        for (const key in TWMap.villages) {
            applyColorToTile(TWMap.villages[key]);
        }
    }

    function removeAllOverlays() {
        document.querySelectorAll('[id^="gcm_tile_"]').forEach(el => el.remove());
    }

    // ─── Hook spawnSector ─────────────────────────────────────────────────────────

    function hookSpawnSector() {
        // Guarda original apenas uma vez (evita cadeia dupla em re-execução)
        if (!TWMap.mapHandler._gcm_orig) {
            TWMap.mapHandler._gcm_orig = TWMap.mapHandler.spawnSector;
        }

        TWMap.mapHandler.spawnSector = function (data, sector) {
            // Chama handler original primeiro (mantém comportamento do jogo)
            TWMap.mapHandler._gcm_orig.call(this, data, sector);

            const subSize = TWMap.mapSubSectorSize || 15;
            const bx = sector.x - data.x;
            const ex = bx + subSize;
            const by = sector.y - data.y;
            const ey = by + subSize;

            for (let x in data.tiles) {
                x = parseInt(x, 10);
                if (x < bx || x >= ex) continue;
                for (let y in data.tiles[x]) {
                    y = parseInt(y, 10);
                    if (y < by || y >= ey) continue;
                    const v = TWMap.villages[(data.x + x) * 1000 + (data.y + y)];
                    if (v) applyColorToTile(v);
                }
            }
        };
    }

    function restoreSpawnSector() {
        if (TWMap.mapHandler._gcm_orig) {
            TWMap.mapHandler.spawnSector = TWMap.mapHandler._gcm_orig;
            delete TWMap.mapHandler._gcm_orig;
        }
    }

    // ─── Utilitários ──────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

})();
