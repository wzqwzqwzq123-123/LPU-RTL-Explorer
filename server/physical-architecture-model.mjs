import { promises as fs } from 'node:fs'
import { buildArchitectureDrilldownModel } from './architecture-drilldown-model.mjs'

const FALLBACK_RULES = {
  schemaVersion: 1,
  hemisphereIndexMapping: [
    { index: 0, regionId: 'east', status: 'rtl-confirmed', basis: 'HEMISPHERE_INDEX == 0 selects gen_east_host_column', source: { file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 428 } },
    { index: 1, regionId: 'west', status: 'rtl-confirmed', basis: 'The else branch is named gen_west_host_column', source: { file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 431 } },
  ],
  regionOrder: ['external', 'control', 'west', 'central', 'east'],
  functionalOrder: {
    west: ['mxm', 'sxm', 'mem'],
    central: ['vxm'],
    east: ['mem', 'sxm', 'mxm'],
    external: ['external-memory', 'external-bus-boundary'],
    control: ['instruction-control', 'qctl'],
  },
  wrapperPolicy: [],
}

export async function loadPhysicalArchitectureRules(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
    return {
      ...FALLBACK_RULES,
      ...parsed,
      functionalOrder: { ...FALLBACK_RULES.functionalOrder, ...(parsed.functionalOrder ?? {}) },
    }
  } catch {
    return FALLBACK_RULES
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function signalBase(value = '') {
  return value.replace(/\[[^\]]*\]/g, '').replace(/[^A-Za-z0-9_$]/g, '')
}

function inferSignalGroup(raw) {
  const text = `${raw.signalName} ${raw.connectionExpression}`.toLowerCase()
  const signal = raw.signalName.toLowerCase()
  const specific = (id, name, attribute) => ({ id, name, attribute })
  const localMem = signal.match(/^local_mem_issue_(valid|instruction|cycle)/)
  if (localMem) return specific(`mem-local-issue-${localMem[1]}`, `MEM Local Issue ${localMem[1][0].toUpperCase()}${localMem[1].slice(1)}`, localMem[1] === 'valid' ? 'Handshake' : localMem[1] === 'cycle' ? 'Schedule' : 'Instruction')
  const issueMatch = signal.match(/^(?:external_)?(vxm_local|vxm_global|sxm_transpose|sxm_permute|mem|mxm_load|mxm_dequant|mxm_compute)_issue_(valid|ready|instruction|cycle)/)
  if (issueMatch) {
    const roleNames = { vxm_local: 'VXM Local', vxm_global: 'VXM Global', sxm_transpose: 'SXM Transpose', sxm_permute: 'SXM Permute', mem: 'MEM External', mxm_load: 'MXM Load', mxm_dequant: 'MXM Dequant', mxm_compute: 'MXM Compute' }
    const attributeNames = { valid: 'Valid', ready: 'Ready', instruction: 'Instruction', cycle: 'Cycle' }
    const attributeKinds = { valid: 'Handshake', ready: 'Handshake', instruction: 'Instruction', cycle: 'Schedule' }
    return specific(`${issueMatch[1]}-issue-${issueMatch[2]}`, `${roleNames[issueMatch[1]]} Issue ${attributeNames[issueMatch[2]]}`, attributeKinds[issueMatch[2]])
  }
  if (/macro_adapter_enable/.test(signal)) return specific('macro-dispatch-enable', 'Macro Dispatch Selection Enable', 'Control')
  if (/macro_dispatch_valid/.test(signal)) return specific('macro-dispatch-valid', 'Macro Dispatch Valid', 'Handshake')
  if (/macro_dispatch_payload/.test(signal)) return specific('macro-dispatch-payload', 'Macro Dispatch Payload', 'Instruction')
  if (/^dispatch_valid_o/.test(signal)) return specific('selected-dispatch-valid', 'Selected Dispatch Valid', 'Handshake')
  if (/^dispatch_payload_o/.test(signal)) return specific('selected-dispatch-payload', 'Selected Dispatch Payload', 'Instruction')
  const vxmNative = signal.match(/vxm_(config|execute)_(valid|ready|instruction)/)
  if (vxmNative) return specific(`vxm-${vxmNative[1]}-${vxmNative[2]}`, `VXM ${vxmNative[1] === 'config' ? 'Configuration' : 'Execute'} ${vxmNative[2][0].toUpperCase()}${vxmNative[2].slice(1)}`, vxmNative[2] === 'instruction' ? 'Instruction' : 'Handshake')
  if (/^(command_write|loader_transaction|config_)/.test(signal)) {
    if (/(valid|ready)/.test(signal)) return specific('program-command-handshake', 'Program Command Handshake', 'Handshake')
    if (/(address|scope|destination|format|count|opcode)/.test(signal)) return specific('program-command-metadata', 'Program Command / Route Metadata', 'Command')
  }
  if (/^(dma_response|reassembler_word|word_(?:data|destination|imem_address|last|scope|strb|valid|ready)|distributor_input|distribution_(west|east)|input_|distributor_(west|east)|west_load|east_load)/.test(signal)) {
    if (/(valid|ready)/.test(signal)) return specific('program-load-handshake', 'Program Load Handshake', 'Handshake')
    if (/strb/.test(signal)) return specific('program-word-strobe', 'Program Word Strobe · 4 × 32-bit', 'Control')
    if (/(data|keep)/.test(signal)) return specific('program-load-payload', 'Program Word · 128-bit Transport', 'Data')
    if (/control/.test(signal)) return specific('program-load-control', 'Program Load Control · WRITE / PRIME', 'Control')
    if (/(scope|destination|imem_address|last)/.test(signal)) return specific('program-load-routing', 'Scope / 12-bit Destination / iMEM Address', 'Command')
  }
  if (/^(west|east)_commit_(valid|ready|error)/.test(signal)) return specific('program-commit-handshake', 'Ordered Commit · valid / ready / error', /error/.test(signal) ? 'Fault' : 'Handshake')
  const streamDirection = /east/.test(signal) ? 'East' : /west/.test(signal) ? 'West' : null
  if (streamDirection && /(valid|ready|data|payload)/.test(signal)) {
    const attribute = /ready/.test(signal) ? 'Ready' : /valid/.test(signal) ? 'Valid' : 'Payload'
    return specific(`${streamDirection.toLowerCase()}-stream-${attribute.toLowerCase()}`, `${streamDirection} Stream ${attribute}`, attribute === 'Payload' ? 'Data' : 'Handshake')
  }
  if (/queue_fault|fault/.test(signal)) return specific('queue-fault-return', 'Queue Fault Return', 'Fault')
  if (raw.signalGroup) return raw.signalGroup
  if (/(valid|ready|fire|consume)/.test(text)) return { id: 'handshake', name: 'Handshake' }
  if (/(data|payload|result|value)/.test(text)) return { id: 'data', name: 'Data / Payload' }
  if (/(instr|instruction|command|issue)/.test(text)) return { id: 'command', name: 'Command / Instruction' }
  if (/(fault|error|conflict)/.test(text)) return { id: 'fault', name: 'Fault / Error' }
  if (/(config|mode|enable)/.test(text)) return { id: 'configuration', name: 'Configuration' }
  return { id: 'unclassified', name: 'Unclassified / Needs Review' }
}

function buildSignalGroups(rawIds, rawMap) {
  const groups = new Map()
  for (const id of rawIds) {
    const raw = rawMap.get(id)
    if (!raw) continue
    const group = inferSignalGroup(raw)
    if (!groups.has(group.id)) groups.set(group.id, { ...group, rawConnectionIds: [] })
    groups.get(group.id).rawConnectionIds.push(id)
  }
  return [...groups.values()]
}

function moduleLocation(snapshot, moduleName) {
  const definition = snapshot.modules.find((item) => item.name === moduleName)
  return definition ? { file: definition.file, line: definition.line } : null
}

function mapping(container, selector, cardinality, basis, status = 'rtl-confirmed') {
  return {
    rtlNodeId: container?.id ?? null,
    rtlPath: container?.path ?? null,
    moduleName: container?.moduleName ?? null,
    instanceName: container?.name ?? null,
    instanceSelector: selector,
    cardinality,
    generateContext: container?.generateContext ?? null,
    source: container ? { file: container.sourceFile, line: container.line } : null,
    evidenceStatus: status,
    basis,
  }
}

function block({
  id,
  displayName,
  shortName,
  kind,
  regionId,
  order,
  functionText,
  instanceCount,
  instanceCountExpression,
  placementStatus,
  placementBasis,
  rtlMappings,
  definitionNames,
  parameters = [],
  structure,
  primary = true,
  enabledByDefault = true,
  instanceCountStatus = 'rtl-confirmed',
}) {
  return {
    id,
    displayName,
    shortName,
    kind,
    regionId,
    order,
    function: functionText,
    instanceCount,
    instanceCountExpression,
    instanceCountStatus,
    placementStatus,
    placementBasis,
    primary,
    enabledByDefault,
    rtlMappings,
    definitionNames,
    parameters,
    structure,
    inputInterfaceIds: [],
    outputInterfaceIds: [],
  }
}

function matchingInterface(architecture, scopeId, sourceModule, destinationModule, semanticId) {
  return architecture.interfaces.find((item) => item.scopeId === scopeId &&
    item.id.includes(`:${semanticId}:`) &&
    item.sourceInstances.some((endpoint) => endpoint.moduleName === sourceModule) &&
    item.destinationInstances.some((endpoint) => endpoint.moduleName === destinationModule)) ?? null
}

function interfaceFrom({
  id,
  name,
  plane,
  direction,
  sourceBlockId,
  destinationBlockId,
  semanticInterfaces = [],
  rawConnectionIds = [],
  rawMap,
  evidenceStatus = 'rtl-confirmed',
  topologyStatus = 'rtl-confirmed',
  pathKind = 'direct-net',
  classificationBasis,
  rtlPath = [],
  notes = [],
}) {
  const ids = unique([...rawConnectionIds, ...semanticInterfaces.flatMap((item) => item?.rawConnectionIds ?? [])])
  const raws = ids.map((rawId) => rawMap.get(rawId)).filter(Boolean)
  return {
    id,
    name,
    plane,
    direction,
    sourceBlockId,
    destinationBlockId,
    semanticInterfaceIds: unique(semanticInterfaces.map((item) => item?.id)),
    rawConnectionIds: ids,
    signalGroups: buildSignalGroups(ids, rawMap),
    signalCount: ids.length,
    totalResolvedWidth: raws.every((raw) => raw.resolvedWidth !== null) ? raws.reduce((sum, raw) => sum + raw.resolvedWidth, 0) : null,
    evidenceStatus,
    topologyStatus,
    pathKind,
    classificationBasis,
    rtlPath,
    notes,
  }
}

export function buildPhysicalArchitectureModel(snapshot, architecture, suppliedRules = {}) {
  const rules = {
    ...FALLBACK_RULES,
    ...suppliedRules,
    functionalOrder: { ...FALLBACK_RULES.functionalOrder, ...(suppliedRules.functionalOrder ?? {}) },
  }
  const containers = architecture.containers
  const rawMap = new Map(architecture.rawConnections.map((raw) => [raw.id, raw]))
  const cluster = containers.find((item) => item.moduleName === 'lpu_fu_subsystem_cluster' && item.primary)
  const clusterChildren = containers.filter((item) => item.parentId === cluster?.id && item.primary)
  const mem = clusterChildren.find((item) => item.moduleName === 'lpu_mem_subsystem')
  const sxm = clusterChildren.find((item) => item.moduleName === 'lpu_sxm_subsystem')
  const mxm = clusterChildren.find((item) => item.moduleName === 'lpu_mxm_subsystem')
  const vxm = clusterChildren.find((item) => item.moduleName === 'lpu_vxm_subsystem')
  const qctl = clusterChildren.find((item) => item.moduleName === 'lpu_qctl_system')
  const programControl = containers.find((item) => item.moduleName === 'lpu_program_load_controller' && item.primary)
  const programLoadSubsystem = containers.find((item) => item.moduleName === 'lpu_program_load_system' && item.primary)
  const programLoader = containers.find((item) => item.moduleName === 'lpu_program_load_controller' && item.primary)
  const programDistributionIngress = containers.find((item) => item.moduleName === 'lpu_program_load_system' && item.primary)
  const programDistributionNetwork = containers.find((item) => item.moduleName === 'lpu_program_distribute_system' && item.primary)
  const instructionDma = containers.find((item) => item.moduleName === 'lpu_instruction_dma' && item.primary)
  const programConfigFifo = containers.find((item) => item.moduleName === 'lpu_program_load_config_fifo' && item.primary)
  const programReassembler = containers.find((item) => item.moduleName === 'lpu_program_load_reassembler' && item.primary)
  const programWordFifo = containers.find((item) => item.moduleName === 'lpu_program_load_word_fifo' && item.primary)
  const programDistributor = containers.find((item) => item.moduleName === 'lpu_program_distributor' && item.primary)
  const programElasticStage = containers.find((item) => item.moduleName === 'lpu_program_distribute_elastic_stage' && item.primary)
  const programRelayChain = containers.find((item) => item.moduleName === 'lpu_program_distribute_relay_chain' && item.primary)

  const regions = [
    { id: 'external', name: 'External Program Memory Boundary', order: 0, placementStatus: 'needs-review', topologyStatus: 'needs-review', basis: 'Current RTL exposes a generic Program DMA command/response boundary. No DDR controller, DDR memory model, or standard AXI five-channel adapter is instantiated in the authoritative RTL snapshot.' },
    { id: 'west', name: 'West Hemisphere', order: 2, placementStatus: 'rtl-confirmed', topologyStatus: 'architecture-inferred', basis: 'HEMISPHERE_INDEX 1 is selected by gen_west_host_column; left/right presentation is a functional-topology view, not floorplan coordinates.' },
    { id: 'central', name: 'Central / On-chip Bisection', order: 3, placementStatus: 'architecture-inferred', topologyStatus: 'architecture-inferred', basis: 'The single VXM instance is outside the two-hemisphere generate loop and connects both MEM sides.' },
    { id: 'east', name: 'East Hemisphere', order: 4, placementStatus: 'rtl-confirmed', topologyStatus: 'architecture-inferred', basis: 'HEMISPHERE_INDEX 0 is selected by gen_east_host_column; left/right presentation is a functional-topology view, not floorplan coordinates.' },
    { id: 'control', name: 'Program Load and Distributed Instruction Control', order: 1, placementStatus: 'architecture-inferred', topologyStatus: 'architecture-inferred', basis: 'The display separates the RTL-confirmed Instruction DMA, response reassembly, hemisphere distribution and FU-local instruction-control path. Relative placement is architectural, not floorplan data.' },
  ]

  const memStructure = {
    viewType: 'mem-array',
    facts: [
      { label: 'Native groups', value: 13, expression: 'MEM_GROUPS = 13', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
      { label: 'Native slices / hemisphere', value: 52, expression: 'MEM_SLICES_PER_HEMISPHERE = 52', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
      { label: 'Slices / group', value: 4, expression: 'MEM_SLICES_PER_GROUP = 4', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
      { label: 'Banks / slice', value: 2, expression: 'MEM_BANKS_PER_SLICE = 2', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
      { label: 'Bank-local frontends / hemisphere', value: 104, expression: 'MEM_BANKS_PER_HEMISPHERE = 104', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
      { label: 'MEM banks / system', value: 208, expression: 'HEMISPHERES × 52 × 2', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
      { label: 'MEM machine code', value: 64, expression: 'MEM_INSTRUCTION_WIDTH = 64', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
      { label: 'Private Native command', value: 32, expression: 'MEM_NATIVE_COMMAND_WIDTH = 32', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
      { label: 'Native leaf depth', value: 8192, expression: 'SRAM_DEPTH_ROWS = 8192', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
    ],
    array: { groups: 13, slicesPerGroup: 4, banksPerSlice: 2, superlaneLeavesPerBank: 4 },
    controlPath: ['104 paired local instruction frontend + timed queue paths', '64-bit MEM ISA', '104 south-to-north MEM64 bank commands', '104 MEM64 → Native32 adapters', 'Native bank execution'],
    storagePath: ['13 mem_group', '52 mem_slice', '104 independent banks', '4 × 8192×64 behavioral superlane SRAM leaves / bank'],
    namingNote: 'USE_NATIVE_MEM defaults to 1. Native32 exists only beyond the adapter boundary. The disabled Legacy Compatibility branch maps Bank0 into 52 old issue paths and turns Bank1 issue into an explicit sticky compatibility fault.',
  }
  const mxmStructure = {
    viewType: 'mxm-array',
    facts: [
      { label: 'MXM instances / hemisphere', value: 2, expression: 'local_mxm_gen < 2', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 493 } },
      { label: 'Tiles / compute', value: 4, expression: 'TILES = 4', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/mxm/lpu_mxm_compute.sv', line: 26 } },
      { label: 'Blocks / tile', value: 4, expression: 'BLOCKS = 4', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/mxm/lpu_mxm_compute.sv', line: 27 } },
      { label: 'Lanes', value: 8, expression: 'LANES = 8', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/mxm/lpu_mxm_compute.sv', line: 28 } },
      { label: 'Dot rows', value: null, expression: 'DOT_ROWS = 1 or 8 (conditional compilation)', evidenceStatus: 'needs-review', source: { file: 'rtl/mxm/lpu_mxm_compute.sv', line: 31 } },
    ],
    controlPath: ['Load frontend + timed queue', 'Dequant frontend + timed queue', 'Compute frontend + timed queue', 'Local coordinator'],
    executionPath: ['Weight buffer', 'Dot-bank compute array', 'Shared accumulator'],
  }
  const sxmStructure = {
    viewType: 'sxm-fabric',
    facts: [
      { label: 'Tiles', value: 4, expression: 'TILES = 4', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/sxm/lpu_sxm_slice.sv', line: 24 } },
      { label: 'Rows', value: 8, expression: 'ROWS = 8', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/sxm/lpu_sxm_slice.sv', line: 25 } },
      { label: 'Transpose planes', value: 2, expression: 'PLANES = 2', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/sxm/lpu_sxm_slice.sv', line: 26 } },
      { label: 'Streams / direction', value: 32, expression: 'STREAMS = 32', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/sxm/lpu_sxm_slice.sv', line: 27 } },
      { label: 'Lanes', value: 8, expression: 'LANES = 8', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/sxm/lpu_sxm_slice.sv', line: 28 } },
    ],
    executionPath: ['East/West pass-through', 'Transpose bank', 'Permutation routing', 'SXM control'],
  }
  const vxmStructure = {
    viewType: 'vxm-tiles',
    facts: [
      { label: 'Connected hemispheres', value: 2, expression: 'HEMISPHERES = 2', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/vxm/lpu_vxm_slice.sv', line: 36 } },
      { label: 'Tiles', value: 4, expression: 'TILES = 4', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/vxm/lpu_vxm_slice.sv', line: 37 } },
      { label: 'Lanes / tile', value: 8, expression: 'lpu_pkg::LANES_PER_TILE = 8', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 4 } },
      { label: 'Streams / direction', value: 32, expression: 'lpu_pkg::STREAMS_PER_DIRECTION = 32', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 8 } },
    ],
    executionPath: ['VXM control', '4 generated vector tiles', 'Per-tile execution stages / ALUs', 'Per-tile LUT subsystem'],
  }

  const blocks = []
  for (const region of ['west', 'east']) {
    const hemisphereIndex = region === 'east' ? 0 : 1
    const placement = rules.hemisphereIndexMapping.find((item) => item.index === hemisphereIndex)
    const order = rules.functionalOrder[region]
    const placementBasis = `${placement?.basis ?? `hemisphere ${hemisphereIndex}`}; relative display order is a topology presentation, not physical coordinates.`
    blocks.push(block({ id: `physical:${region}:mem`, displayName: `MEM ${region === 'east' ? 'East' : 'West'}`, shortName: 'MEM', kind: 'mem', regionId: region, order: order.indexOf('mem'), functionText: 'Native-default MEM with 104 paired bank-local instruction frontend + timed queue paths south of the bank array. Each paired path emits a MEM64 command northward into its logical bank control column; legality checks, private Native32 adaptation and bidirectional stream data remain explicit.', instanceCount: 1, instanceCountExpression: `hemisphere_gen = ${hemisphereIndex}`, placementStatus: placement?.status ?? 'needs-review', placementBasis, rtlMappings: [mapping(mem, `hemisphere_gen=${hemisphereIndex}`, 1, 'Two-instance generate loop with an RTL-confirmed hemisphere selector.')], definitionNames: ['lpu_mem_subsystem', 'lpu_mem_srf_command_integration', 'mem_hemisphere', 'mem_group', 'mem_slice', 'lpu_mem_bank_superlane_leaf'], parameters: ['USE_NATIVE_MEM=1', 'MEM_SLICES_PER_HEMISPHERE=52', 'MEM_BANKS_PER_HEMISPHERE=104', 'MEM_INSTRUCTION_WIDTH=64', 'MEM_NATIVE_COMMAND_WIDTH=32', 'SRAM_DEPTH_ROWS=8192'], structure: memStructure }))
    blocks.push(block({ id: `physical:${region}:sxm`, displayName: `SXM ${region === 'east' ? 'East' : 'West'}`, shortName: 'SXM', kind: 'sxm', regionId: region, order: order.indexOf('sxm'), functionText: 'East/West stream pass-through, transpose storage and permutation routing.', instanceCount: 1, instanceCountExpression: `hemisphere_gen = ${hemisphereIndex}`, placementStatus: placement?.status ?? 'needs-review', placementBasis, rtlMappings: [mapping(sxm, `hemisphere_gen=${hemisphereIndex}`, 1, 'SXM is instantiated inside the same confirmed hemisphere loop as MEM.')], definitionNames: ['lpu_sxm_subsystem', 'lpu_sxm_slice', 'lpu_sxm_control'], structure: sxmStructure }))
    blocks.push(block({ id: `physical:${region}:mxm`, displayName: `MXM ${region === 'east' ? 'East' : 'West'} ×2`, shortName: 'MXM ×2', kind: 'mxm', regionId: region, order: order.indexOf('mxm'), functionText: 'Two local MXM engines sharing the hemisphere stream boundary, with load, dequant and compute paths.', instanceCount: 2, instanceCountExpression: `hemisphere_gen=${hemisphereIndex}, local_mxm_gen=0..1`, placementStatus: placement?.status ?? 'needs-review', placementBasis, rtlMappings: [mapping(mxm, `hemisphere_gen=${hemisphereIndex}; local_mxm_gen=0..1`, 2, 'Nested generate loop instantiates two MXM subsystems per hemisphere.')], definitionNames: ['lpu_mxm_subsystem', 'lpu_mxm_slice', 'lpu_mxm_compute', 'lpu_mxm_weight_buffer', 'lpu_mxm_shared_accumulator'], parameters: ['LOCAL_MXM_INDEX=0..1', 'ACCUMULATOR_BLOCK_COUNT=lpu_pkg::MXM_ACCUMULATOR_BLOCK_COUNT'], structure: mxmStructure }))
  }
  blocks.push(block({ id: 'physical:central:vxm', displayName: 'VXM Central', shortName: 'VXM', kind: 'vxm', regionId: 'central', order: 0, functionText: 'Single vector execution subsystem bridging stream traffic from both MEM hemispheres.', instanceCount: 1, instanceCountExpression: 'single u_vxm_subsystem outside hemisphere generate', placementStatus: 'architecture-inferred', placementBasis: 'The single instance is outside the hemisphere loop and its ports cover both hemisphere slices; “central” is a functional-topology placement, not a floorplan coordinate.', rtlMappings: [mapping(vxm, 'single instance', 1, 'Single subsystem instance connected to both halves of the MEM stream vectors.')], definitionNames: ['lpu_vxm_subsystem', 'lpu_vxm_slice', 'lpu_vxm_tile', 'lpu_vxm_execution_stage'], structure: vxmStructure }))
  blocks.push(block({
    id: 'physical:external:instruction-ddr',
    displayName: 'External Instruction DDR',
    shortName: 'DDR',
    kind: 'external-memory',
    regionId: 'external',
    order: 0,
    functionText: 'Intended external storage for program-image bytes. This is an architecture endpoint only: no DDR controller or memory model is instantiated in the authoritative RTL snapshot.',
    instanceCount: 0,
    instanceCountExpression: 'No DDR/DRAM module or memory model found in current RTL/filelist',
    instanceCountStatus: 'needs-review',
    placementStatus: 'needs-review',
    placementBasis: 'lpu_top exposes a generic Program DMA request/response boundary, while the testbench supplies response beats. The external memory controller and protocol adapter remain outside the current RTL.',
    rtlMappings: [mapping(null, 'external program-image storage endpoint', 0, 'Architecture placeholder; no synthesized RTL instance exists.', 'needs-review')],
    definitionNames: [],
    parameters: ['Capacity: not modeled', 'Controller: not modeled', 'Simulation response source: testbench task'],
    structure: { viewType: 'external-memory', facts: [{ label: 'RTL instances', value: 0, expression: 'no DDR/DRAM module found', evidenceStatus: 'needs-review', source: { file: 'rtl/lpu_top.sv', line: 31 } }], storagePath: ['Program image bytes (external)', 'Generic Program DMA boundary', 'Implemented post-response Program Transfer'], namingNote: 'DDR is an external endpoint, not an RTL-confirmed on-chip SRAM. Program Transfer begins after the generic DMA response crosses the top-level boundary.' },
  }))
  blocks.push(block({
    id: 'physical:external:program-bus',
    displayName: 'AXI / C2C Memory Boundary',
    shortName: 'BUS BOUNDARY',
    kind: 'external-bus-boundary',
    regionId: 'external',
    order: 1,
    functionText: 'Protocol boundary between the generic Program DMA request/response contract and an external memory fabric. Standard AXI AR/AW/W/R/B channels are not present in the current RTL.',
    instanceCount: 0,
    instanceCountExpression: 'No AXI/C2C adapter module found; only generic program_dma_cmd_* / program_dma_rsp_* top ports exist',
    instanceCountStatus: 'needs-review',
    placementStatus: 'needs-review',
    placementBasis: 'The generic command/response boundary is RTL-confirmed. Mapping it to AXI or C2C is a future integration decision and is intentionally not fabricated here.',
    rtlMappings: [mapping(null, 'external fabric adapter', 0, 'Boundary placeholder backed by top-level generic Program DMA ports, not a protocol adapter instance.', 'needs-review')],
    definitionNames: [],
    parameters: ['Request: address[63:0], length[31:0], id[7:0]', 'Response: data[255:0], keep[31:0], last, id[7:0], error', 'AXI five channels: absent'],
    structure: { viewType: 'external-bus-boundary', controlPath: ['Generic Program Read Request', 'External protocol adapter: Needs Review', 'Generic Program Response Beats'], namingNote: 'The label names the intended integration boundary; it does not assert a current AXI implementation.' },
  }))
  blocks.push(block({
    id: 'physical:control:instruction-dma',
    displayName: 'Instruction DMA',
    shortName: 'INSTRUCTION DMA',
    kind: 'instruction-dma',
    regionId: 'control',
    order: 0,
    functionText: 'RTL-confirmed read-request and response-buffer engine for program-image transport, with ordered outstanding-ID tracking and terminal fault detection.',
    instanceCount: 1,
    instanceCountExpression: 'single u_instruction_dma inside u_program_transfer',
    placementStatus: 'rtl-confirmed',
    placementBasis: 'lpu_program_transfer_path explicitly instantiates lpu_instruction_dma and binds its generic external command/response ports to the Program DMA boundary.',
    rtlMappings: [mapping(instructionDma, 'u_instruction_dma', 1, 'Explicit RTL instance in the Program Load subsystem.')],
    definitionNames: ['lpu_instruction_dma', 'lpu_queue_fifo'],
    parameters: ['DMA_DATA_WIDTH=256', 'DMA_ID_WIDTH=8', 'OUTSTANDING_DEPTH=16', 'RX_FIFO_DEPTH=16', 'RESPONSE_WIDTH=298'],
    structure: { viewType: 'instruction-dma', facts: [{ label: 'Data width', value: 256, expression: 'DMA_DATA_WIDTH = 256', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_instruction_dma.sv', line: 2 } }, { label: 'Outstanding IDs', value: 16, expression: 'OUTSTANDING_DEPTH = 16', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_instruction_dma.sv', line: 4 } }, { label: 'Response FIFO depth', value: 16, expression: 'RX_FIFO_DEPTH = 16', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_instruction_dma.sv', line: 5 } }, { label: 'Buffered response width', value: 298, expression: '256 data + 32 keep + 8 id + last + error', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_instruction_dma.sv', line: 35 } }], controlPath: ['Loader transaction command', 'Outstanding ID FIFO', 'Generic external Program DMA boundary', 'Response FIFO', 'ID/error check', 'Program response output'], namingNote: 'This module emits a generic read contract; it is not itself an AXI master or a DDR controller.' },
  }))
  blocks.push(block({ id: 'physical:control:program-load', displayName: 'Program Load Pipeline', shortName: 'PROGRAM LOAD', kind: 'program-load-pipeline', regionId: 'control', order: 0, functionText: 'Primary end-to-end architecture view of command descriptors, Instruction DMA, response reassembly, the explicit Word FIFO → WRITE/PRIME mux → 165-bit elastic-stage handoff, independent Scope expansion and complete 12-bit Destination delivery to FU Subsystems.', instanceCount: 1, instanceCountExpression: 'single active lpu_program_load_subsystem pipeline; target 2 × 7 Relay stages are not integrated', placementStatus: 'architecture-inferred', placementBasis: 'The current integrated Program Load path and one lpu_program_load_relay module passed the listed VCS regressions. The full East/West Relay chains, R6 terminal interfaces and central VXM direct bypass do not exist in the current hierarchy.', rtlMappings: [mapping(programLoadSubsystem, 'u_program_load', 1, 'Top-level Program Load subsystem wrapper.'), mapping(programLoader, 'u_loader', 1, '32-entry command descriptor store and sequencer.'), mapping(instructionDma, 'u_instruction_dma', 1, 'RTL Instruction DMA request/response engine.'), mapping(programConfigFifo, 'u_config_fifo', 1, 'Paired Image Context FIFO.'), mapping(programReassembler, 'u_reassembler', 1, 'Response-byte reassembly engine.'), mapping(programWordFifo, 'u_word_fifo', 1, 'Explicit reconstructed Program Word FIFO.'), mapping(programDistributor, 'u_distributor', 1, 'RTL-confirmed Scope expansion and endpoint distributor.'), mapping(programElasticStage, 'u_input_elastic', 1, 'Two-entry 165-bit distributor input stage.'), mapping(null, 'target East/West Relay chains', 14, 'One Relay stage is implemented and VCS-verified; the 2 × 7 target chain is not instantiated.', 'partially-verified')], definitionNames: ['lpu_program_load_subsystem', 'lpu_program_loader', 'lpu_instruction_dma', 'lpu_program_config_fifo', 'lpu_program_reassembler', 'lpu_program_word_fifo', 'lpu_program_load_distributor', 'lpu_program_load_elastic_stage', 'lpu_program_load_relay'], parameters: ['COMMAND_DEPTH=32', 'CONFIG_FIFO_DEPTH=16', 'REASSEMBLY_BUFFER_BYTES=64', 'WORD_FIFO_DEPTH=8', 'ELASTIC_DEPTH=2', 'PROGRAM_LOAD_CONTROL_WIDTH=1', 'PROGRAM_WORD_WIDTH=128', 'PROGRAM_SCOPE_WIDTH=2', 'PROGRAM_DESTINATION_WIDTH=12', 'RELAY_RECORD_WIDTH=165', 'RELAY_BUFFER_DEPTH=2', 'RELAY_COUNT_PER_HEMISPHERE=7'], structure: { viewType: 'program-load-pipeline', facts: [{ label: 'Command descriptors', value: 32, expression: 'COMMAND_DEPTH = 32', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_loader.sv', line: 2 } }, { label: 'Image context entries', value: 16, expression: 'CONFIG_FIFO_DEPTH = 16', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_load_subsystem.sv', line: 290 } }, { label: 'Byte reservoir', value: 64, expression: 'REASSEMBLY_BUFFER_BYTES = 64', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_reassembler.sv', line: 6 } }, { label: 'Word FIFO depth', value: 8, expression: 'WORD_FIFO_DEPTH = 8', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_load_subsystem.sv', line: 404 } }, { label: 'Control width', value: 1, expression: 'WRITE=0 / PRIME=1', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_load_pkg.sv', line: 14 } }, { label: 'Record width', value: 165, expression: '1 + 128 + 4 + 2 + 12 + 17 + 1', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_load_elastic_stage.sv', line: 30 } }, { label: 'Scope width', value: 2, expression: 'EAST / WEST / BOTH', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_load_pkg.sv', line: 11 } }, { label: 'Destination width', value: 12, expression: 'H[11] + Kind[10:8] + Local[7:0]', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_load_pkg.sv', line: 15 } }, { label: 'Elastic depth', value: 2, expression: 'ELASTIC_DEPTH = 2', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_load_distributor.sv', line: 2 } }, { label: 'Target Relay stages', value: 14, expression: '2 hemispheres × ceil(13 groups / 2 groups per Relay)', evidenceStatus: 'needs-review', source: { file: 'rtl/program_load/lpu_program_load_relay.sv', line: 1 } }, { label: 'Current Relay implementation', value: 1, expression: 'single reusable lpu_program_load_relay module', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_load_relay.sv', line: 1 } }], controlPath: ['Command descriptors', 'Instruction DMA read', 'Response reassembly', 'Reassembled Word FIFO', 'WRITE / PRIME handoff mux', '165-bit input elastic stage', 'Scope expansion', 'West / East unicast records', 'Complete 12-bit Destination into FU Subsystem', 'Target 2×7 Relay chains (Not Implemented)'], namingNote: 'Scope and Destination have different roles: Scope requests EAST/WEST/BOTH fanout, while each emitted record carries one concrete 12-bit Destination. One Relay stage is implemented and VCS-verified. The displayed 2×7 chain, R6 MXM/SXM termination and central VXM direct Program Load bypass are target structures and are not implemented.' }, enabledByDefault: true }))
  const programLoadBlock = blocks.find((item) => item.id === 'physical:control:program-load')
  if (programLoadBlock?.structure) {
    programLoadBlock.displayName = 'Program Load System + Program Distribution System'
    programLoadBlock.shortName = 'LOAD + DISTRIBUTE'
    programLoadBlock.function = 'Main RTL chain: Instruction DMA → response buffer → Assembler/Reassembler → Program Word FIFO → Distributor Elastic Stage → West/East Relay chains → FU frontend/local iMEM. The central VXM route branches directly from the Distributor elastic head and bypasses both Relay chains.'
    programLoadBlock.instanceCountExpression = 'top siblings: u_program_load_system + u_program_distribute_system + u_fu_subsystems; East R0–R6 + West R0–R6 = 14 integrated two-entry Relay stages'
    programLoadBlock.placementStatus = 'rtl-confirmed'
    programLoadBlock.placementBasis = 'lpu_top directly instantiates Program Load, Program Distribution and the FU Cluster as three siblings. Program Distribution is not nested in the Cluster. Its two generated seven-stage Relay chains connect through top-level Program buses to fourteen MEM Local Program Ports without a Hemisphere 7-to-1 round-robin.'
    programLoadBlock.rtlMappings = [
      mapping(programControl, 'u_program_load_controller', 1, 'Program command and lifecycle owner.'),
      mapping(programLoader, 'u_program_load_controller', 1, 'Command descriptor storage and sequencing.'),
      mapping(programLoadSubsystem, 'u_program_load_system', 1, 'Owns controller + load path: Instruction DMA, buffered response, Reassembler/Assembler and Program Word FIFO.'),
      mapping(programDistributionIngress, 'u_program_load_system', 1, 'WRITE/PRIME selection and East/West/BOTH distribution ingress.'),
      mapping(programDistributionNetwork, 'u_program_distribute_system', 1, 'Top-level Distribution sibling: input Elastic Stage, direct VXM route, two Relay chains and FU-local Program buses.'),
      mapping(programRelayChain, 'gen_program_relay_chain[0:1].u_program_relay_chain', 2, 'Two RTL-instantiated Hemisphere chains; each chain generates seven two-entry lpu_program_distribute_relay stages.'),
      mapping(cluster, 'u_fu_subsystems', 1, 'Top-level FU Cluster sibling: QCTL, Schedule Cycle and FU-local Frontend/Subsystem ownership only.'),
    ]
    programLoadBlock.definitionNames = ['lpu_program_load_controller', 'lpu_program_load_system', 'lpu_program_load_path', 'lpu_program_load_reassembler', 'lpu_program_load_config_fifo', 'lpu_program_load_word_fifo', 'lpu_instruction_dma', 'lpu_program_distributor', 'lpu_program_distribute_elastic_stage', 'lpu_program_distribute_system', 'lpu_program_distribute_relay_chain', 'lpu_program_distribute_relay', 'lpu_fu_subsystem_cluster']
    programLoadBlock.structure.facts = programLoadBlock.structure.facts
      .filter((item) => !['Target Relay stages', 'Current Relay implementation'].includes(item.label))
      .concat([
        { label: 'Integrated Relay stages', value: 14, expression: 'East R0–R6 + West R0–R6', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_distribute_system.sv', line: 248 } },
        { label: 'Relay capacity / stage', value: 2, expression: 'BUFFER_DEPTH = 2', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_distribute_relay.sv', line: 2 } },
        { label: 'Independent MEM Local Program Ports', value: 14, expression: '2 hemispheres × 7 Relay-local ports', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/program_load/lpu_program_distribute_system.sv', line: 1 } },
        { label: 'MEM Local Program Ports / Hemisphere', value: 7, expression: 'R0–R6 fixed Bank ranges', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/mem/lpu_mem_subsystem.sv', line: 1 } },
        { label: 'Distribution handshakes verified', value: 14, expression: 'all fourteen independent Valid/Ready/Error handshakes in one cycle', evidenceStatus: 'rtl-confirmed', source: { file: 'handoff/history/20261116_042422_relay_local_program_ports.md', line: 1 } },
        { label: 'Physical iMEM writes verified / Hemisphere', value: 7, expression: 'seven simultaneous writes into seven real local iMEM arrays', evidenceStatus: 'rtl-confirmed', source: { file: 'handoff/history/20261116_042422_relay_local_program_ports.md', line: 1 } },
      ])
    for (const fact of programLoadBlock.structure.facts) {
      if (fact.label === 'Command descriptors') fact.source = { file: 'rtl/program_load/lpu_program_load_controller.sv', line: 1 }
      if (fact.label === 'Image context entries') fact.source = { file: 'rtl/program_load/lpu_program_load_config_fifo.sv', line: 1 }
      if (fact.label === 'Word FIFO depth') fact.source = { file: 'rtl/program_load/lpu_program_load_word_fifo.sv', line: 1 }
    }
    programLoadBlock.structure.controlPath = ['Instruction DMA', 'Buffered DMA response', 'Assembler / Reassembler', 'Program Word FIFO', 'Distributor Elastic Stage', 'West/East R0–R6 Relay chains', 'FU frontend / local iMEM', 'Per-FU decode and data path']
    programLoadBlock.structure.namingNote = 'The command descriptor store is an RTL register array, not instruction-payload SRAM. Program Load, Program Distribution and FU Cluster are direct lpu_top siblings. VXM branches directly from the Distributor elastic head and bypasses Relay. MEM and MXM local frontends are integrated; SXM and VXM expose real subsystem boundaries but their local load adapters remain unintegrated. No same-named decoder module is invented for those two endpoints.'
  }

  blocks.push(block({
    id: 'physical:control:qctl',
    displayName: 'QCTL System · 220 Formal Endpoints',
    shortName: 'QCTL',
    kind: 'qctl',
    regionId: 'control',
    order: 5,
    functionText: 'Shared QCTL Pool → 220 per-Queue Caches → 220 five-state Controllers → 208 MEM and 12 MXM FU-local Scheduler Cycle Counters. The integrated Barrier, 32-bit TAG Event Buffer and MEM_PACKET retirement path implement blocking semantics; VXM and SXM are not formal QCTL endpoints in the current cluster integration.',
    instanceCount: 1,
    instanceCountExpression: 'if (ENABLE_QCTL), QCTL_QUEUE_COUNT=220',
    placementStatus: 'rtl-confirmed',
    placementBasis: 'The current RTL directly instantiates lpu_qctl_system under the conditional gen_qctl branch and maps its scheduler_counter_ce outputs to MEM and MXM local counters. ENABLE_QCTL defaults to 0, so the system is integrated but default-gated.',
    rtlMappings: [mapping(qctl, 'gen_qctl.u_qctl_system', 1, 'Current QCTL System instance under the conditional generate branch.', 'rtl-confirmed')],
    definitionNames: ['lpu_qctl_system', 'lpu_qctl_shared_pool', 'lpu_qctl_queue_cache', 'lpu_qctl_controller', 'lpu_qctl_sync_fabric', 'lpu_qctl_event_buffer'],
    parameters: ['QCTL_QUEUE_COUNT=220', 'CACHE_DEPTH=4', 'EVENT_DEPTH=8', 'EVENT_TAG_WIDTH=32', 'MEM=0..207', 'MXM_LOAD=208..211', 'MXM_DEQUANT=212..215', 'MXM_COMPUTE=216..219'],
    structure: {
      viewType: 'qctl-system',
      facts: [
        { label: 'Formal endpoint count', value: 220, expression: 'QCTL_QUEUE_COUNT = 220', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/core/lpu_pkg.sv', line: 1 } },
        { label: 'Queue Cache count', value: 220, expression: 'one lpu_qctl_queue_cache / endpoint', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/icu/lpu_qctl_system.sv', line: 187 } },
        { label: 'Queue Controller count', value: 220, expression: 'one lpu_qctl_controller / endpoint', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/icu/lpu_qctl_system.sv', line: 215 } },
        { label: 'Controller states', value: 5, expression: 'IDLE + four semantic wait states', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/icu/lpu_qctl_controller.sv', line: 33 } },
        { label: 'Event TAG width', value: 32, expression: 'QCTL_OPERAND_WIDTH', evidenceStatus: 'rtl-confirmed', source: { file: 'rtl/icu/lpu_qctl_event_buffer.sv', line: 4 } },
      ],
      controlPath: ['Shared QCTL Pool', 'Per-Queue Cache ×220', 'Per-Queue five-state Controller ×220', 'scheduler_counter_ce', 'MEM local counters ×208 + MXM local counters ×12'],
      namingNote: 'RTL integrated, default gated (ENABLE_QCTL=0). Formal endpoint numbering covers MEM and MXM only; VXM and SXM have no direct QCTL counter-control connection. MEM_PACKET retirement is packet/data-movement completion, not SRAM Commit. VCS results cover Controller, Shared Pool, QCTL System, MEM native and top macro-frontend scopes; they are not a complete DMA system-level pass.',
    },
    primary: true,
    enabledByDefault: false,
  }))

  const blockMap = new Map(blocks.map((item) => [item.id, item]))
  const clusterScopeId = cluster?.id
  const stream = {
    memToSxm: matchingInterface(architecture, clusterScopeId, 'lpu_mem_subsystem', 'lpu_sxm_subsystem', 'east-stream'),
    sxmToMem: matchingInterface(architecture, clusterScopeId, 'lpu_sxm_subsystem', 'lpu_mem_subsystem', 'west-stream'),
    sxmToMxm: matchingInterface(architecture, clusterScopeId, 'lpu_sxm_subsystem', 'lpu_mxm_subsystem', 'east-stream'),
    memToVxm: matchingInterface(architecture, clusterScopeId, 'lpu_mem_subsystem', 'lpu_vxm_subsystem', 'west-stream'),
  }
  const rawIdsFor = (pattern) => architecture.rawConnections
    .filter((raw) => raw.scopeId === clusterScopeId && pattern.test(`${signalBase(raw.signalName)} ${raw.connectionExpression}`))
    .map((raw) => raw.id)
  const rawIdsByScope = (scopeModules, pattern) => architecture.rawConnections
    .filter((raw) => scopeModules.includes(raw.scopeModule) && pattern.test(`${raw.signalName} ${raw.connectionExpression}`))
    .map((raw) => raw.id)
  const vxmToMemRaw = rawIdsFor(/vxm_to_mem_east_(valid|data)/)
  const mxmToSxmRaw = rawIdsFor(/(local_mxm_west|mxm_west)_(valid|data)/)
  const interfaces = []
  const externalRequestRaw = rawIdsByScope(['lpu_top', 'lpu_program_load_system', 'lpu_program_load_path', 'lpu_instruction_dma'], /^(program_ddr_read_req_|ddr_read_req_)/)
  const externalResponseRaw = rawIdsByScope(['lpu_top', 'lpu_program_load_system', 'lpu_program_load_path', 'lpu_instruction_dma'], /^(program_ddr_read_rsp_|ddr_read_rsp_|reasm_rsp_)/)
  const dmaCommandRaw = rawIdsByScope(['lpu_program_load_system', 'lpu_program_load_path', 'lpu_instruction_dma'], /^(ctrl_load_txn|ctrl_dma_cmd|ddr_read_req|command_fire)/)
  const dmaResponseRaw = rawIdsByScope(['lpu_program_load_system', 'lpu_program_load_path', 'lpu_instruction_dma'], /^(ddr_read_rsp|reasm_rsp|response_)/)
  interfaces.push(interfaceFrom({ id: 'physical-interface:external:ddr-read-request', name: 'External Memory Read Request', plane: 'control', direction: 'external-read-request', sourceBlockId: 'physical:external:program-bus', destinationBlockId: 'physical:external:instruction-ddr', rawMap, evidenceStatus: 'needs-review', topologyStatus: 'needs-review', pathKind: 'wrapper-chain', classificationBasis: 'Intended external-memory request path. The current RTL stops at a generic Program DMA boundary; no DDR controller or protocol adapter implementation is present.', rtlPath: [{ label: 'External DDR/C2C boundary comment', file: 'rtl/program_load/lpu_program_control_system.sv', line: 34, kind: 'wrapper-chain' }], notes: ['Architecture placeholder only; no AXI AR channel or DDR controller is asserted.'] }))
  interfaces.push(interfaceFrom({ id: 'physical-interface:external:ddr-read-response', name: 'External Memory Response Beats', plane: 'data', direction: 'external-read-response', sourceBlockId: 'physical:external:instruction-ddr', destinationBlockId: 'physical:external:program-bus', rawMap, evidenceStatus: 'needs-review', topologyStatus: 'needs-review', pathKind: 'wrapper-chain', classificationBasis: 'Intended external-memory response path. In the current system testbench, a task directly drives response beats instead of instantiating a memory model.', rtlPath: [{ label: 'Testbench response-beat stimulus', file: 'sim/tb/lpu_top_fu_subsystem_program_tb.sv', line: 485, kind: 'wrapper-chain' }], notes: ['Simulation stimulus is evidence of the generic response contract, not evidence of DDR or AXI RTL.'] }))
  interfaces.push(interfaceFrom({ id: 'physical-interface:dma:external-request', name: 'Program Read Request', plane: 'control', direction: 'external-read-request', sourceBlockId: 'physical:control:instruction-dma', destinationBlockId: 'physical:external:program-bus', rawConnectionIds: externalRequestRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'needs-review', pathKind: 'wrapper-chain', classificationBasis: 'lpu_instruction_dma emits generic ready/valid address, length and ID fields through top-level program_dma_cmd_* ports. The generic boundary is confirmed; an AXI/C2C protocol mapping is not.', rtlPath: [{ label: 'Instruction DMA request output', file: 'rtl/program_load/lpu_instruction_dma.sv', line: 56, kind: 'continuous-assignment' }, { label: 'Top-level Program DMA request ports', file: 'rtl/lpu_top.sv', line: 47, kind: 'wrapper-chain' }], notes: ['64-bit address · 32-bit length · 8-bit ID.', 'No AXI ARVALID/ARREADY/ARADDR/ARLEN interface was found.'] }))
  interfaces.push(interfaceFrom({ id: 'physical-interface:dma:external-response', name: 'Program Response Beats', plane: 'data', direction: 'external-read-response', sourceBlockId: 'physical:external:program-bus', destinationBlockId: 'physical:control:instruction-dma', rawConnectionIds: externalResponseRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'needs-review', pathKind: 'wrapper-chain', classificationBasis: 'Top-level program_dma_rsp_* fields bind to the Instruction DMA generic response inputs. The response contract is confirmed; its external transport protocol and memory implementation are not.', rtlPath: [{ label: 'Top-level Program DMA response ports', file: 'rtl/lpu_top.sv', line: 52, kind: 'wrapper-chain' }, { label: 'Instruction DMA response FIFO input', file: 'rtl/program_load/lpu_instruction_dma.sv', line: 69, kind: 'processing-stage' }], notes: ['256-bit data · 32-bit keep · last · 8-bit ID · error.', 'The system testbench directly drives these fields.'] }))
  interfaces.push(interfaceFrom({ id: 'physical-interface:program:dma-command', name: 'Loader Transaction Command', plane: 'control', direction: 'instruction-dma-command', sourceBlockId: 'physical:control:program-load', destinationBlockId: 'physical:control:instruction-dma', rawConnectionIds: dmaCommandRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'rtl-confirmed', pathKind: 'direct-net', classificationBasis: 'An accepted loader transaction atomically launches the Instruction DMA command while enqueuing its matching image context.', rtlPath: [{ label: 'Loader transaction gate', file: 'rtl/program_load/lpu_program_load_subsystem.sv', line: 303, kind: 'processing-stage' }, { label: 'Instruction DMA command binding', file: 'rtl/program_load/lpu_program_load_subsystem.sv', line: 351, kind: 'port-binding' }], notes: ['This command controls program-image transport; it is not an FU base instruction.'] }))
  interfaces.push(interfaceFrom({ id: 'physical-interface:program:dma-response', name: 'Buffered Program Response', plane: 'data', direction: 'instruction-dma-response', sourceBlockId: 'physical:control:instruction-dma', destinationBlockId: 'physical:control:program-load', rawConnectionIds: dmaResponseRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'rtl-confirmed', pathKind: 'direct-net', classificationBasis: 'The Instruction DMA response FIFO output feeds the reassembler inside the Program Load subsystem.', rtlPath: [{ label: 'DMA response output binding', file: 'rtl/program_load/lpu_program_load_subsystem.sv', line: 368, kind: 'port-binding' }, { label: 'Reassembler response input', file: 'rtl/program_load/lpu_program_load_subsystem.sv', line: 400, kind: 'port-binding' }], notes: ['The response remains generic and ordered by the DMA ID FIFO.'] }))
  for (const region of ['west', 'east']) {
    const suffix = region === 'west' ? 'W' : 'E'
    const selectorNote = `Applies to ${region} hemisphere generate slice; raw snapshot retains the symbolic template rather than elaborating a duplicate instance.`
    interfaces.push(interfaceFrom({ id: `physical-interface:${region}:vxm-to-mem-east`, name: `${suffix}: VXM → MEM · East Stream (RTL name)`, plane: 'data', direction: 'east-stream', sourceBlockId: 'physical:central:vxm', destinationBlockId: `physical:${region}:mem`, rawConnectionIds: vxmToMemRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'architecture-inferred', pathKind: 'indexed-net-alias', classificationBasis: 'The VXM east_to_mem outputs and MEM east_edge inputs share vxm_to_mem_east vectors with hemisphere slicing.', rtlPath: [{ label: 'VXM east_to_mem output', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 604, kind: 'port-binding' }, { label: 'Hemisphere vector slice', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 465, kind: 'indexed-net' }], notes: [selectorNote, 'Direction name follows RTL port naming; spatial arrow follows the selected hemisphere layout.'] }))
    interfaces.push(interfaceFrom({ id: `physical-interface:${region}:mem-to-sxm-east`, name: `${suffix}: MEM → SXM · East Stream`, plane: 'data', direction: 'east-stream', sourceBlockId: `physical:${region}:mem`, destinationBlockId: `physical:${region}:sxm`, semanticInterfaces: [stream.memToSxm], rawMap, classificationBasis: 'Direct MEM east_edge output to SXM east_inner input in the hemisphere loop.', rtlPath: [{ label: 'Direct shared mem_east_valid/data nets', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 467, kind: 'direct-net' }], notes: [selectorNote] }))
    interfaces.push(interfaceFrom({ id: `physical-interface:${region}:sxm-to-mxm-east`, name: `${suffix}: SXM → MXM · East Stream`, plane: 'data', direction: 'east-stream', sourceBlockId: `physical:${region}:sxm`, destinationBlockId: `physical:${region}:mxm`, semanticInterfaces: [stream.sxmToMxm], rawMap, classificationBasis: 'Direct SXM east_outer output fans out to the two local MXM east_from_sxm inputs.', rtlPath: [{ label: 'Direct shared sxm_east_valid/data nets', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 487, kind: 'direct-net' }], notes: [selectorNote, 'The destination functional block aggregates two RTL MXM instances.'] }))
    interfaces.push(interfaceFrom({ id: `physical-interface:${region}:mxm-to-sxm-west`, name: `${suffix}: MXM → SXM · West Stream via merge`, plane: 'data', direction: 'west-stream', sourceBlockId: `physical:${region}:mxm`, destinationBlockId: `physical:${region}:sxm`, rawConnectionIds: mxmToSxmRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'architecture-inferred', pathKind: 'processed-path', classificationBasis: 'Two MXM west outputs enter an always_comb merge/conflict check before driving the SXM west_outer input.', rtlPath: [{ label: 'Two MXM west_to_sxm outputs', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 549, kind: 'port-binding' }, { label: 'Hemisphere merge and conflict detection', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 556, kind: 'processing-stage' }, { label: 'SXM west_outer input', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 488, kind: 'port-binding' }], notes: [selectorNote, 'This is explicitly not modeled as a direct wire because the RTL performs merge/arbitration logic.'] }))
    interfaces.push(interfaceFrom({ id: `physical-interface:${region}:sxm-to-mem-west`, name: `${suffix}: SXM → MEM · West Stream`, plane: 'data', direction: 'west-stream', sourceBlockId: `physical:${region}:sxm`, destinationBlockId: `physical:${region}:mem`, semanticInterfaces: [stream.sxmToMem], rawMap, classificationBasis: 'Direct SXM west_inner output to MEM west_edge input.', rtlPath: [{ label: 'Direct shared sxm_west_valid/data nets', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 468, kind: 'direct-net' }], notes: [selectorNote] }))
    interfaces.push(interfaceFrom({ id: `physical-interface:${region}:mem-to-vxm-west`, name: `${suffix}: MEM → VXM · West Stream`, plane: 'data', direction: 'west-stream', sourceBlockId: `physical:${region}:mem`, destinationBlockId: 'physical:central:vxm', semanticInterfaces: [stream.memToVxm], rawMap, pathKind: 'continuous-alias', classificationBasis: 'MEM west output is assigned into a hemisphere slice of mem_to_vxm_west and consumed by VXM.', rtlPath: [{ label: 'MEM west_edge output', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 469, kind: 'port-binding' }, { label: 'Continuous assignment into VXM vector', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 581, kind: 'continuous-assignment' }, { label: 'VXM west_from_mem input', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 600, kind: 'port-binding' }], notes: [selectorNote] }))
  }

  const programLoad = architecture.interfaces.filter((item) => item.category === 'program')
  const memProgramRaw = rawIdsByScope(['lpu_top', 'lpu_program_distribute_system', 'lpu_fu_subsystem_cluster'], /^(relay_mem_|mem_program_)/)
    .filter((id) => !/_scope(?:_i|_o)?$/.test(rawMap.get(id)?.signalName ?? ''))
  const mxmProgramRaw = rawIdsByScope(['lpu_top', 'lpu_program_distribute_system', 'lpu_fu_subsystem_cluster'], /^(relay_outer_|outer_program_|mxm_program_)/)
  const sxmProgramRaw = rawIdsByScope(['lpu_top', 'lpu_program_distribute_system', 'lpu_fu_subsystem_cluster'], /^(relay_outer_|outer_program_|sxm_program_)/)
  const vxmProgramRaw = rawIdsByScope(['lpu_top', 'lpu_program_distribute_system', 'lpu_fu_subsystem_cluster'], /^vxm_program_/)
  for (const region of ['west', 'east']) {
    for (const kind of ['mem', 'mxm']) {
      const destinationModule = kind === 'mem' ? 'lpu_mem_subsystem' : 'lpu_mxm_subsystem'
      const matches = programLoad.filter((item) => item.destinationInstances.some((endpoint) => endpoint.moduleName === destinationModule))
      interfaces.push(interfaceFrom({ id: `physical-interface:control:${region}:${kind}:program`, name: `${kind.toUpperCase()} Local iMEM Load · ${region}`, plane: 'control', direction: 'program-load', sourceBlockId: 'physical:control:program-load', destinationBlockId: `physical:${region}:${kind}`, semanticInterfaces: matches, rawConnectionIds: kind === 'mem' ? memProgramRaw : mxmProgramRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'rtl-confirmed', pathKind: 'processed-path', classificationBasis: kind === 'mem' ? 'The top-level Program Distribution sibling exports seven independent MEM Local Program Ports per Hemisphere. Each R0–R6 port has its own Valid/Ready/Error handshake and fixed Bank ownership; no 7-to-1 round-robin remains.' : 'Program Distribution preserves the complete R6 Outer Local record and routes MXM traffic across the top-level boundary into the FU Cluster.', rtlPath: [{ label: 'Two integrated seven-stage Relay chains', file: 'rtl/program_load/lpu_program_distribute_system.sv', line: 248, kind: 'port-binding' }, { label: kind === 'mem' ? 'Fourteen direct Local Program Port slices' : 'R6 Outer Local MXM decode', file: 'rtl/program_load/lpu_program_distribute_system.sv', line: kind === 'mem' ? 382 : 448, kind: 'processing-stage' }, { label: 'Top-level Program Distribution → FU Cluster boundary', file: 'rtl/lpu_top.sv', line: kind === 'mem' ? 229 : 238, kind: 'port-binding' }, { label: `${destinationModule} Program port bindings`, file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: kind === 'mem' ? 286 : 375, kind: 'port-binding' }], notes: [kind === 'mem' ? 'The current system regression covers the integrated Relay-to-MEM frontend path.' : 'MXM Load/Dequant/Compute endpoint routing remains on the integrated R6 Outer path; bit48 semantics remain Needs Review.', 'Program Distribution is a direct lpu_top child and is not owned by the FU Cluster.'] }))
    }
  }
  for (const region of ['west', 'east']) {
    interfaces.push(interfaceFrom({ id: `physical-interface:control:${region}:sxm:program-boundary`, name: `SXM Program Boundary · ${region}`, plane: 'control', direction: 'program-load', sourceBlockId: 'physical:control:program-load', destinationBlockId: `physical:${region}:sxm`, rawConnectionIds: sxmProgramRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'needs-review', pathKind: 'blocked-boundary', classificationBasis: 'The top-level Program Distribution sibling carries R6 Outer Local traffic to the real SXM subsystem Program Boundary. The subsystem currently holds program_ready_o=0 and program_error_o=0; no local-iMEM / Fetch Adapter or Commit path is integrated.', rtlPath: [{ label: 'R6 Outer Local to SXM classification', file: 'rtl/program_load/lpu_program_distribute_system.sv', line: 448, kind: 'processing-stage' }, { label: 'Top-level Program Distribution → FU Cluster boundary', file: 'rtl/lpu_top.sv', line: 241, kind: 'port-binding' }, { label: 'SXM subsystem Program port binding', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 350, kind: 'port-binding' }, { label: 'SXM endpoint intentionally not integrated', file: 'rtl/sxm/lpu_sxm_subsystem.sv', line: 32, kind: 'continuous-assignment' }], notes: ['Boundary Connected / Endpoint Not Integrated.', 'Ready=0 · No Commit · missing local-iMEM / Fetch Adapter.', 'Standalone SXM Macro Frontend unit test PASS does not prove formal Program Load closure.'] }))
  }
  interfaces.push(interfaceFrom({ id: 'physical-interface:control:central:vxm:program-boundary', name: 'VXM Program Boundary · Central Direct', plane: 'control', direction: 'program-load', sourceBlockId: 'physical:control:program-load', destinationBlockId: 'physical:central:vxm', rawConnectionIds: vxmProgramRaw, rawMap, evidenceStatus: 'rtl-confirmed', topologyStatus: 'needs-review', pathKind: 'blocked-boundary', classificationBasis: 'The top-level Program Distribution sibling routes VXM records directly to the central VXM subsystem Program Boundary and bypasses both Hemisphere Relay chains. The subsystem currently holds program_ready_o=0 and program_error_o=0; no local-iMEM / Fetch Adapter or Commit path is integrated.', rtlPath: [{ label: 'Central VXM direct route', file: 'rtl/program_load/lpu_program_distribute_system.sv', line: 371, kind: 'processing-stage' }, { label: 'Top-level Program Distribution → FU Cluster boundary', file: 'rtl/lpu_top.sv', line: 250, kind: 'port-binding' }, { label: 'VXM subsystem Program port binding', file: 'rtl/core/lpu_fu_subsystem_cluster.sv', line: 473, kind: 'port-binding' }, { label: 'VXM endpoint intentionally not integrated', file: 'rtl/vxm/lpu_vxm_subsystem.sv', line: 30, kind: 'continuous-assignment' }], notes: ['Boundary Connected / Endpoint Not Integrated.', 'Relay bypass · Ready=0 · No Commit · missing local-iMEM / Fetch Adapter.', 'Standalone VXM Macro Frontend unit test PASS does not prove formal Program Load closure.'] }))

  for (const item of interfaces) {
    blockMap.get(item.sourceBlockId)?.outputInterfaceIds.push(item.id)
    blockMap.get(item.destinationBlockId)?.inputInterfaceIds.push(item.id)
  }

  const rtlMappings = blocks.flatMap((item) => item.rtlMappings.map((rtl) => ({
    blockId: item.id,
    rtlNodeId: rtl.rtlNodeId,
    moduleName: rtl.moduleName,
    instanceSelector: rtl.instanceSelector,
    evidenceStatus: rtl.evidenceStatus,
  })))
  const wrapperMappings = (rules.wrapperPolicy ?? []).map((item) => ({
    ...item,
    rtlNodeIds: containers.filter((container) => container.moduleName === item.moduleName).map((container) => container.id),
  }))
  for (const item of interfaces) item.rtlPath = item.rtlPath.filter((evidence) => !/rtl\/program_load\/(lpu_program_control_system|lpu_program_loader|lpu_program_load_subsystem)\.sv/.test(evidence.file))
  regions.sort((left, right) => left.order - right.order)
  const drilldown = buildArchitectureDrilldownModel(snapshot, architecture, blocks, interfaces)
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      defaultView: 'physical',
      statement: 'Physical Architecture 展示功能单元、hemisphere 拓扑与数据/控制关系；RTL Hierarchy 保留源码层次。',
      accuracyStatement: '参考图只决定表达形式。实例数、阵列参数、generate 范围与接口证据均来自当前 RTL；未确认项保留表达式或 Needs Review。',
      floorplanDisclaimer: '此视图不是最终芯片 floorplan，也不表示后端物理坐标或实际布线。',
      evidenceLevels: ['rtl-confirmed', 'simulation-model-confirmed', 'architecture-inferred', 'reference-manual', 'needs-review'],
    },
    regions,
    blocks,
    interfaces,
    rtlMappings,
    wrapperMappings,
    drilldown,
    summary: {
      regionCount: regions.length,
      functionalBlockCount: blocks.filter((item) => item.primary).length,
      optionalBlockCount: blocks.filter((item) => !item.primary).length,
      dataInterfaceCount: interfaces.filter((item) => item.plane === 'data').length,
      controlInterfaceCount: interfaces.filter((item) => item.plane === 'control').length,
      confirmedPlacementCount: blocks.filter((item) => item.placementStatus === 'rtl-confirmed').length,
      inferredPlacementCount: blocks.filter((item) => item.placementStatus === 'architecture-inferred').length,
    },
    sourceEvidence: unique(blocks.flatMap((item) => item.rtlMappings.map((rtl) => rtl.source && `${rtl.source.file}:${rtl.source.line}`))),
  }
}
