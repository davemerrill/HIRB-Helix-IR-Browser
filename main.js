'use strict';

// feature detection for drag&drop upload
const isAdvancedUpload = function()
	{
		const div = document.createElement( 'div' );
		return ( ( 'draggable' in div ) || ( 'ondragstart' in div && 'ondrop' in div ) )
			&& ('FileReader' in window)
			&& ('JSON' in window && 'parse' in JSON && 'stringify' in JSON)
			&& ('classList' in div)
			&& ('querySelector' in document && 'querySelectorAll' in document);
	}();

if (isAdvancedUpload)
{
	$('nope').style.display = 'none';
	$('yup').style.display = '';
}
else
	$('nope').style.display = '';

function toggleHelp()
{
	const elem = $('explain');
	const show = (elem.style.display === 'none');
	elem.style.display = show ? '' : 'none';
	$('toggleHelpLink').innerHTML = show ? 'LESS INFO' : 'MORE INFO';
	//document.body.focus();
}

let presetIRs = [],
	irUsage = [],
	usageColNames = [],
	processedFiles = [],
	droppedFiles = false;


// FILE HANDLING

function handleFiles()
{
	if (droppedFiles.length > 8)
	{
		showMsg('No more than 8 files please!');
		return;
	}

	showMsg('Working...', '');

	presetIRs = [];
	irUsage = [];
	usageColNames = [];
	processedFiles = [];
	presetIRFilter = [];

	// remove files that aren't setlist files, list them out
	let html = [];
	droppedFiles = Array.prototype.filter.call(droppedFiles, function(file)
	{
		if (file.name.substr(-4, 4) === '.hls' && file.type === '')
		{

			html.push(file.name);
			return true;
		}
		else
		{
			html.push(file.name + ' - NOT A SETLIST FILE, IGNORED');
			return false;
		}
	});
	html.sort(sortLC);
	html = html.join('<br>');
	html = '<div id="files-list"><strong>FILES EXAMINED</strong><br>' + html + '</div>';
	$('files-list-container').innerHTML = html;

	/*Array.prototype.sort.call(droppedFiles, function(a, b) {
		return sortLC(a, b, 'name');
	});*/

	let i, j;
	for (i = 0; i <= 128; i++)
	{
		irUsage[i] = [];
		for (j = 0; j <= droppedFiles.length; j++) // <= not typical < because there's a total column at the end
			irUsage[i][j] = 0;
	}

	for (i = 0; i < droppedFiles.length; i++)
		processedFiles[i] = false;

	Array.prototype.forEach.call(droppedFiles, function(file, fileIndex)
	{
		const fileName = file.name;
		usageColNames[fileIndex] = fileName.replace('.hls', '');

		const reader = new FileReader();
		reader.onloadend = function(event)
		{
			processFile(fileIndex, reader.result);
			processedFiles[fileIndex] = true;
			if (processedFiles.indexOf(false) === -1)
				showUI()
		};
		reader.readAsText(file);
	});
}

function showUI()
{
	showMsg('');

	calcTotals();
	renderIRUsage();

	sortPresetIRs('setlistPos');
	renderPresetIRs();

	window.scrollTo(0, 0);
	document.documentElement.classList.add('have-data');
						/*console.log('irUsage', irUsage);
						console.log('usageColNames', usageColNames);
						console.log('presetIRs', presetIRs);*/
}

function processFile(fileIndex, fileContent)
{
	const fileData = JSON.parse(fileContent);
	const base64Data = fileData.encoded_data;
	const binaryData = atob(base64Data);
	const setlistData = JSON.parse(pako.inflate(binaryData, {to: 'string'}));
	usageColNames[fileIndex] = setlistData.meta.name; // TODO: better probably, but usage columns aren't sorted then
	const presets = setlistData.presets;
	presets.forEach(function(preset, presetIndex, presets)
	{
		analyzePreset(fileIndex, presetIndex, preset);
	});
}


// ANALYSIS
function analyzePreset(fileIndex, presetIndex, preset)
{
	if (isEmpty(preset))
		return;

	const blocks = getBlocks(preset.tone);
	const defaultSnapshot = preset.tone.global['@current_snapshot']; // HIGH: use var defaultSnapshot?
	let irs = [];
	let irIndex, i, j;

	for (i = 0; i < blocks.length; i++)
	{
		if (typeof blocks[i].controller['irNumbers'] ==='object')
		{
			for (j = 0; j < blocks[i].controller.irNumbers.length; j++)
			{
				irIndex = blocks[i].controller.irNumbers[j];
				if (irs.indexOf(irIndex) === -1)
				{
					irs.push(irIndex);
					irUsage[irIndex][fileIndex]++;
				}
			}
		}
	}

	if (irs.length > 0)
	{
		irs.sort(sortStd);
		presetIRs.push({setlist: usageColNames[fileIndex], index: presetIndex, name: preset.meta.name, irs: irs, irsList: irs.join(', '), irCount: irs.length});
	}
}

function sortStd(a, b)
{
	if (a < b)
		return -1;
	if (a > b)
		return 1;
	return 0;
}

function getBlocks(tone)
{
	let data = [],
	root = tone,
	rootKey,
	dsp,
	dspItems,
	dspKey,
	blockData,
	blockIndex,
	model,
	path,
	position,
	descr,
	controller	,
	block;
	for (rootKey in root)
	{
		if (root.hasOwnProperty(rootKey) && rootKey.substr(0, 3) === "dsp")
		{
			dsp = parseInt(rootKey.substr(3));
			dspItems = root[rootKey];
			for (dspKey in dspItems)
			{
				if (dspItems.hasOwnProperty(dspKey) && dspKey.substr(0, 5) === "block" && isImportableBlock(dspItems[dspKey]))
				{
					blockIndex = parseInt(dspKey.substr(5));
					blockData = dspItems[dspKey];
									//console.log('blockData', blockData);
					path = parseInt(blockData["@path"]);
					position = parseInt(blockData["@position"]);
					model = getModelName(blockData["@model"]);
					descr = `${model} at path ${getLocation(dsp, path)} position ${position}`;
					controller = getBlockController(tone, rootKey, dspKey, parseInt(blockData["Index"]));
					block = {dsp: dsp, path: path, blockIndex: blockIndex, position: position, model: model, "irIndex": blockData["Index"], description: descr, controller: controller};
					data.push(block);
				}
			}
		}
	}
	return data;
}

function isImportableBlock(blockData)
{
	return (typeof blockData["@model"] === "string" && blockData["@model"].indexOf("ImpulseResponse") >= 0);
}

function getBlockController(tone, rootKey, dspKey, blockIRIndex)
{
								//console.log({tone: tone, rootKey: rootKey, dspKey: dspKey, blockIRIndex: blockIRIndex});
	let controllerData =
		(tone.controller && tone.controller[rootKey] && tone.controller[rootKey][dspKey]) ? tone.controller[rootKey][dspKey].Index : {};
	let data = {controllerType: "IR Block", controllerDescription: "IR block", irs: [{slot: blockIRIndex}], irNumbers: [blockIRIndex]};
	let limits = [];
	let snapshotData,
			controllerType,
			snapshotControllerData,
			descr,
			controllerNum,
			i;
	const MAX_SNAPSHOT_INDEX = 7; // Helix presets have 8 snapshots, indexes 0-7

	if (!isEmpty(controllerData))
	{
		controllerNum = controllerData["@controller"];
		controllerType = getControllerType(controllerNum);
		switch(controllerType)
		{
			case "Snapshots":
				data = {controllerType: controllerType, controllerDescription: "Snapshots", irs: [], irNumbers: [blockIRIndex]};
				for (i = 0; i <= MAX_SNAPSHOT_INDEX; i++)
				{
					snapshotControllerData = tone['snapshot' + i].controllers[rootKey][dspKey];
					if (typeof snapshotControllerData['Index'] === 'object' && typeof snapshotControllerData.Index['@value'] === 'number')
					{
						snapshotData = tone['snapshot' + i];
						descr = typeof snapshotData["@name"] === 'string' ? snapshotData["@name"] : "Snapshot " + i;
						data.irs[i] = {slot: parseInt(snapshotControllerData.Index["@value"]), description: descr};
					}
				}
				break;

			case "Switch":
				descr = `Footswitch ${controllerNum} ${(typeof controllerData["@fs_customlabel"] === 'string') ? controllerData["@fs_customlabel"] : ""}`;
				data = {controllerType: controllerType, controllerDescription: descr, irs: [], irNumbers: [blockIRIndex]};
				data.irs.push({slot: blockIRIndex}); // ir for block itself
				data.irs.push({slot: parseInt(controllerData["@min"])});
				data.irs.push({slot: parseInt(controllerData["@max"])});
				break;

			case "Continuous controller":
				limits[1] = parseInt(controllerData["@min"]);
				limits[2] = parseInt(controllerData["@max"]);
				descr = `Continuous controller ${controllerNum}, range ${limits[1]}-${limits[2]}`;
				data = {controllerType: controllerType, controllerDescription: descr, irs: [], irNumbers: [blockIRIndex]};
				data.irs.push({slot: blockIRIndex}); // ir for block itself
				if (limits[1] > limits[2])
				{
					i = limits[1];
					limits[1] = limits[2];
					limits[2] = i;
				}
				for (i = limits[1]; i <= limits[2]; i++)
					data.irs.push({slot: i});
				break;

			default:
				data = {controllerType: 'UNKNOWN: controllerNum=' + controllerNum, controllerDescription: "", irs: []};
		}

		for (i = 0; i < data.irs.length; i++)
			data.irNumbers.push(data.irs[i].slot);
		data.irCount = data.irNumbers.length;
	}
									//console.log({'data.irNumbers': data.irNumbers, 'data.irs': data.irs, blockIRIndex: blockIRIndex});
	return data;
}

function getControllerType(controllerNum)
{
	if (controllerNum === 19) // snapshots
		return "Snapshots";
	else if (controllerNum >= 6 && controllerNum <= 17) // footswitch HIGH: these might not be right
		return "Switch";
	if (controllerNum >= 1 && controllerNum <= 2) // EXP1, EXP 2 HIGH: check EXP1, external controller numbers probably go up to 5 maybe?
		return "Continuous controller";
	return "";
}

function getModelName(model)
{
	switch(model)
	{
		case "HD2_ImpulseResponse1024":
			return "IR-1024";
		case "HD2_ImpulseResponse2048":
			return "IR-2048";
	}
	return model;
}

function getLocation(dspIndex, path)
{
	const letter = (path === 1) ?  "A" : "B";
	return (dspIndex + 1) & letter;
}

function calcTotals()
{
	usageColNames.push('Total');
	const colCount = usageColNames.length;
	const totalColN = colCount - 1;
	const rowCount = irUsage.length;
	let rowN;
	for (rowN = 1; rowN < rowCount; rowN++)
		irUsage[rowN][totalColN] = irUsage[rowN].reduce((a, b) => a + b, 0);
}

function sortPresetIRs(sortType)
{
	const fn = window['sortPresetIRs_' + sortType];
	presetIRs.sort(fn);
	renderPresetIRs(sortType);

}
function sortPresetIRs_setlistPos(a, b)
{
	const aSetlist = a.setlist.toLowerCase();
	const bSetlist  = b.setlist.toLowerCase();
	if (aSetlist < bSetlist)
		return -1;
	if (aSetlist > bSetlist)
		return 1;
	if (a.index < b.index)
		return -1;
	if (a.index > b.index)
		return 1;
	return 0;
}
function sortPresetIRs_name(a, b)
{
	const aName = a.name.toLowerCase();
	const bName = b.name.toLowerCase();
	if (aName < bName)
		return -1;
	if (aName > bName)
		return 1;
	return sortPresetIRs_setlistPos(a, b);
}
function sortPresetIRs_irCount(a, b)
{
	if (a.irCount < b.irCount)
		return 1;
	if (a.irCount > b.irCount)
		return -1;
	return sortPresetIRs_setlistPos(a, b);
}


// RENDERING

function renderIRUsage()
{
	const colCount = usageColNames.length;
	const rowCount = irUsage.length;
	let colN, rowN;
	let html = `
					<table id="irUsageTable">
					<caption>
						IR Usage By Setlist
						<input type="button" class="btnTiny copyBtn" value="Copy..." onclick="copyIRUsage()">
						<div class="controls">
							<label onclick="showHideIRDetails()"><input type="checkbox" id="cbIRDetails" checked>Show setlist details</label> &nbsp;
							<label onclick="showHideUnusedIRs()"><input type="checkbox" id="cbIRUnused">Hide unused</label>
						</div>
					</caption>
				 `;
	html += '<thead><tr><th>#</th><th><input type="button" class="btnTiny" onclick="clearIRFilter(this)" value="Clear"></th>';
	for (colN = 0; colN < colCount - 1; colN++)
		html += `<th>${usageColNames[colN]}</th>`;
	html += `<th>${usageColNames[colN]}</th>`;
	html += '</thead></tr><tbody>';

	for (rowN = 1; rowN < rowCount; rowN++) // row 0 isn't used
	{
		html += `<tr class="${irUsage[rowN][colN] ? 'used' : 'unused'}" id="irRow${rowN}">`;
			html += `<td class="center">${rowN}</td>`;
			//html += `<td class="center"><input type="checkbox" name="irSelect" value="${rowN}"></td>`;
			html += '<td class="center">';
			if (irUsage[rowN][colN] > 0)
				html += `<input type="checkbox" name="irSelect" value="${rowN}">`;
			html += '</td>';
			for (colN = 0; colN < colCount - 1; colN++)
				html += `<td>${irUsage[rowN][colN]}</td>`;
			html += `<td>${irUsage[rowN][colN]}</td>`; // total
		html += '</tr>';
	}

	html += '</tbody></table>';
	$('irUsageContainer').innerHTML = html;

	$$('#irUsageTable tbody', true).addEventListener('click', irUsageTableClick);
}

function copyIRUsage()
{
	const hideUnused = $('cbIRUnused').checked;
	const showDetails = $('cbIRDetails').checked;
									console.log({hideUnused: hideUnused, showDetails: showDetails});

	const rowCount = irUsage.length;
	const totalsColN = usageColNames.length - 1;
	let colN, rowN;

	let t = '#\t';
	if (showDetails)
	{
		for (colN = 0; colN < totalsColN; colN++)
			t += usageColNames[colN] + '\t';
	}
	t += usageColNames[totalsColN] + '\r'; // total

	for (rowN = 1; rowN < rowCount; rowN++) // row 0 isn't used
	{
		if (!hideUnused || (irUsage[rowN][totalsColN] > 0))
		{
			t += rowN + '\t';
			if (showDetails)
			{
				for (colN = 0; colN < totalsColN; colN++)
					t += irUsage[rowN][colN] + '\t';
			}
			t += irUsage[rowN][totalsColN] + '\r'; // total
		}
	}

	copyUIShow(t);
}

function irUsageTableClick(e)
{
	let elem = e.target;
	let cb;
	while (elem.nodeName !== 'TR' && elem.parentNode)
		elem = elem.parentNode;

	if (elem.nodeName === 'TR')
	{
		cb = elem.querySelector('input');
		if (!cb) // no checkbox,this ir isn't used
			return;
		if (e.target.nodeName !== 'INPUT')
			cb.checked = !cb.checked;
		elem.classList.toggle('selected', cb.checked);
	}

	if (e.ctrlKey)
	{
		const cbs = $$('[name=irSelect]:checked');
		for (let i = 0; i < cbs.length; i++)
		{
			if (!cb || cbs[i] !== cb)
			{
				cbs[i].checked = false;
				$('irRow' + cbs[i].value).classList.remove('selected');
			}
		}
	}

	setIRFilter();
}

let presetIRFilter = [];
function setIRFilter()
{
	let i;

	presetIRFilter = [];
	const cbs = $$('[name=irSelect]:checked');
	for (i = 0; i < cbs.length; i++)
		presetIRFilter.push(parseInt(cbs[i].value));

	let html = presetIRFilter.length ?  '#presetIRsTable tbody tr {display: none;}' : '';
	for (i = 0; i < presetIRFilter.length; i++)
		html += '#presetIRsTable tbody tr.ir' + presetIRFilter[i] + ' {display: table-row;}';
	$('presetIRsFilterCSS').innerHTML = html;

	const visibleCount = countVisiblePresets();
	$('irCount').innerHTML = presetIRFilter.length ? visibleCount + ' / ' + presetIRs.length : presetIRs.length;
}

function countVisiblePresets()
{
	const container = $$('#presetIRsTable tbody', true);
	let visibleCount = 0;
	let i = 0;
	for (i = 0; i < container.rows.length; i++)
	{
		if (container.rows[i].offsetParent)
			visibleCount++;
	}
	return visibleCount;
}

function clearIRFilter()
{
	let i;

	const cbs = $$('[name=irSelect]:checked');
	for (i = 0; i < cbs.length; i++)
		cbs[i].checked = false;

	const rows = $$('#irUsageTable tr.selected');
	for (i = 0; i < cbs.length; i++)
		rows[i].classList.remove('selected');

	setIRFilter();
}

function showHideIRDetails()
{
	const table = $('irUsageTable');
	const rowCount = table.rows.length;
	const lastCol = table.rows[0].cells.length -1;
	const display = $('cbIRDetails').checked ? '' : 'none';
							console.log(rowCount, lastCol);
	let rowN, colN;
	for (rowN = 0; rowN < rowCount; rowN++)
	{
		for (colN = 2; colN < lastCol; colN++)
			table.rows[rowN].cells[colN].style.display = display;
	}
}
function showHideUnusedIRs()
{
	const hide = $('cbIRUnused').checked;
	$('irUsageTable').classList.toggle('hide-unused', hide);
}


function renderPresetIRs(sortType)
{
	const rowCount = presetIRs.length;
	let preset, rowN;
	let html = `<table id="presetIRsTable">
						<caption>
							Presets With IRs (<span id="irCount">${rowCount}</span>)
							<input type="button" class="btnTiny copyBtn" value="Copy..." onclick="copyPresetIRs()">
							<div class="controls">
								View by
								<label><input type="radio" name="rbPresetSort" onclick="sortPresetIRs(this.value)" value="setlistPos" checked>Setlist and position</label>
								<label><input type="radio" name="rbPresetSort" onclick="sortPresetIRs(this.value)" value="name">Name</label>
								<label><input type="radio" name="rbPresetSort" onclick="sortPresetIRs(this.value)" value="irCount">IR count</label>
							</div>
						</caption>
				  `;
	html += `<thead><tr><th>Setlist</th><th class="center">#</th><th>Name</th><th>IR Count</th><th>IRs Used</th></tr></thead><tbody>`;
	for (rowN = 0; rowN < rowCount; rowN++)
	{
		preset = presetIRs[rowN];
		html += `<tr id="presetRow${rowN}"${calcPresetRowClasses(preset)}>
						<td>${preset.setlist}</td>
						<td class="center">${preset.index + 1}</td>
						<td>${preset.name}</td>
						<td class="center">${preset.irCount}</td>
						<td class="irs-list">${preset.irsList}</td>
					</tr>`;
	}
	html += '</tbody></table>';
	$('presetIRsContainer').innerHTML = html;

	if (sortType)
	{
		$$('[name=rbPresetSort]').forEach(function(rb)
		{
			rb.checked = (rb.value === sortType);
		});
	}

	$('stats').style.display = '';
}

function copyPresetIRs()
{
	const rowCount = presetIRs.length;
	const noFilter = (presetIRFilter.length === 0);
	let preset, rowN;
	let t = 'Setlist\t#\tName\tIR CountIR Count\tIRs Used\n';
	for (rowN = 0; rowN < rowCount; rowN++)
	{
		if (noFilter || $('presetRow' + rowN).offsetParent)
		{
			preset = presetIRs[rowN];
			t += preset.setlist + '\t' +
				(preset.index + 1) + '\t' +
				preset.name + '\t' +
				preset.irCount + '\t' +
				preset.irsList + '\r';
		}
	}
	copyUIShow(t);
}

function calcPresetRowClasses(preset)
{
	let classes = [];
	let i;
	for (i = 0; i < preset.irs.length; i++)
		classes.push('ir' + preset.irs[i]);
	let html = '';
	if (classes.length)
		html = ' class="' + classes.join(' ') + '"';
	return html;
}


// UTILITIES

function $(id)
{
	return document.getElementById(id);
}
function $$(selector, one)
{
	if (one)
		return document.querySelector(selector);
	return document.querySelectorAll(selector);
}

function isEmpty(obj)
{
	for (let key in obj)
		return false;
	return true;
}

function sortLC(a, b, key)
{
	const _a = (key ? a[key] : a).toLowerCase(),
			_b = (key ? b[key] : b).toLowerCase();
	if (_a < _b)
		return -1;
	if (_a > _b)
		return 1;
	return 0;
}

function showMsg(msg)
{
	const elem = $('msg');
	elem.innerHTML = msg;
	elem.style.display = msg ? '' : 'none';
	setTimeout(function()
	{
		elem.style.display = 'none';
	}, 3000);
}

function copyUIShow(text)
{
	$('copy-ta').value = text;
	$('copy-div').style.display = '';
	window.addEventListener('keydown', copyUIKeyHandler);
}
function copyUIHide()
{
	$('copy-div').style.display = 'none';
	window.removeEventListener('keydown', copyUIKeyHandler);
}
function copyUIKeyHandler(e)
{
	if (e.keyCode === 27) // escape
		copyUIHide();
}



// DRAG/DROP

// drag&drop files if the feature is available
if (isAdvancedUpload)
{
	const form = $('form');
	const page = document.documentElement;
	const body = document.body;

	form.classList.add( 'has-advanced-upload' ); // letting the CSS part to know drag&drop is supported by the browser

	[ 'drag', 'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop' ].forEach( function( event )
	{
		page.addEventListener( event, function( e )
		{
			// preventing the unwanted behaviours
			e.preventDefault();
			e.stopPropagation();
		});
	});
	[ 'dragover', 'dragenter' ].forEach( function( event )
	{
		page.addEventListener( event, function()
		{
			page.classList.add( 'dragover' );
		});
	});
	[ 'dragleave', 'dragend', 'drop' ].forEach( function( event )
	{
		page.addEventListener( event, function()
		{
			page.classList.remove( 'dragover' );
		});
	});
	page.addEventListener( 'drop', function( e )
	{
		droppedFiles = e.dataTransfer.files; // the files that were dropped
		handleFiles();
	});
}


function findUnusedCssRules(excludeRegex)
{
	excludeRegex = '\.dragover|:hover|:focus';
	let i, j, rules, selector;
	const sheets = document.styleSheets;
	for (i = 0; i < sheets.length; i++)
	{
		rules = sheets[i].cssRules;
		for (j = 0; j < rules.length; j++)
		{
			selector = rules[j].selectorText;
			if (selector && !selector.match(excludeRegex))
			{
				if ($$(selector).length === 0)
					console.log(rules[j].selectorText);
			}
			else if (!selector)
				console.log(i, j, rules[j], sheets[i].href);
		}
	}
}

