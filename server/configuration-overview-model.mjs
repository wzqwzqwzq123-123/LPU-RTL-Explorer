const source = (file, line, symbol, expression, status = 'rtl-confirmed') => ({ file, line, symbol, expression, status })

function moduleParameter(snapshot, moduleName, parameterName) {
  const module = snapshot.modules?.find((item) => item.name === moduleName)
  const parameter = module?.parameters?.find((item) => item.name === parameterName)
  if (!parameter) return null
  return {
    value: Number.isFinite(parameter.resolvedDefault) ? parameter.resolvedDefault : null,
    expression: parameter.default,
    evidence: source(module.file, module.line, `${moduleName}.${parameterName}`, parameter.raw),
  }
}

function globalParameter(snapshot, name, sourceFile = null) {
  const matches = (snapshot.configuration?.globalParameters ?? []).filter((item) =>
    item.name === name && (!sourceFile || item.sourceFile === sourceFile))
  const parameter = matches[0]
  if (!parameter) return null
  return {
    value: Number.isFinite(parameter.resolvedDefault) ? parameter.resolvedDefault : null,
    expression: parameter.default,
    evidence: source(parameter.sourceFile, parameter.line, `${parameter.packageName}::${parameter.name}`, parameter.raw),
  }
}

function physicalFact(physicalArchitecture, blockId, label) {
  const fact = physicalArchitecture?.blocks?.find((block) => block.id === blockId)?.structure?.facts?.find((item) => item.label === label)
  if (!fact) return null
  return {
    value: fact.value,
    expression: fact.expression,
    evidence: source(fact.source.file, fact.source.line, label, fact.expression, fact.evidenceStatus),
  }
}

function instanceSource(snapshot, parentModule, instanceName, symbol, expression) {
  const definition = snapshot.modules?.find((item) => item.name === parentModule)
  const instance = definition?.instances?.find((item) => item.name === instanceName)
  return source(definition?.file ?? 'snapshot', instance?.line ?? definition?.line ?? 1, symbol ?? instanceName, expression, instance ? 'rtl-confirmed' : 'needs-review')
}

function resolved(primary, fallback, label) {
  if (primary && Number.isFinite(primary.value)) return primary
  if (fallback && Number.isFinite(fallback.value)) return fallback
  return {
    value: null,
    expression: primary?.expression ?? fallback?.expression ?? 'unresolved',
    evidence: source(primary?.evidence?.file ?? fallback?.evidence?.file ?? 'snapshot', primary?.evidence?.line ?? fallback?.evidence?.line ?? 1, label, primary?.expression ?? fallback?.expression ?? 'unresolved', 'needs-review'),
  }
}

const multiply = (...values) => values.every(Number.isFinite) ? values.reduce((result, value) => result * value, 1) : null
const divideCeil = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? Math.ceil(numerator / denominator) : null

function unit(id, name, unitType, category, count, expression, evidence, status = evidence?.status ?? 'rtl-confirmed', detail = null) {
  return { id, name, unitType, category, count, expression, evidence: evidence ? [evidence] : [], status, detail }
}

export function buildConfigurationOverviewModel(snapshot, physicalArchitecture) {
  const pkg = 'rtl/core/lpu_pkg.sv'
  const hemispheres = resolved(globalParameter(snapshot, 'HEMISPHERES', pkg), null, 'HEMISPHERES')
  const memColumns = resolved(moduleParameter(snapshot, 'lpu_mem_subsystem', 'ACTIVE_COLUMNS'), physicalFact(physicalArchitecture, 'physical:west:mem', 'Active columns / hemisphere'), 'ACTIVE_COLUMNS')
  const memGroups = resolved(globalParameter(snapshot, 'MEM_GROUPS', pkg), physicalFact(physicalArchitecture, 'physical:west:mem', 'Column groups'), 'MEM_GROUPS')
  const columnsPerGroup = resolved(globalParameter(snapshot, 'MEM_SLICES_PER_GROUP', pkg), physicalFact(physicalArchitecture, 'physical:west:mem', 'Columns / group'), 'MEM_SLICES_PER_GROUP')
  const banksPerColumn = resolved(globalParameter(snapshot, 'MEM_BANKS_PER_SLICE', pkg), physicalFact(physicalArchitecture, 'physical:west:mem', 'Banks / column'), 'MEM_BANKS_PER_SLICE')
  const tileRows = resolved(globalParameter(snapshot, 'TILE_ROWS', pkg), physicalFact(physicalArchitecture, 'physical:west:mem', 'Tile slices / bank'), 'TILE_ROWS')
  const lanesPerTile = resolved(globalParameter(snapshot, 'LANES_PER_TILE', pkg), physicalFact(physicalArchitecture, 'physical:central:vxm', 'Lanes / tile'), 'LANES_PER_TILE')
  const packageStreamColumns = resolved(globalParameter(snapshot, 'STREAM_REGISTER_COLUMNS', pkg), null, 'STREAM_REGISTER_COLUMNS')
  const activeStreamColumns = resolved(
    moduleParameter(snapshot, 'lpu_mem_srf_command_integration', 'COLUMNS'),
    moduleParameter(snapshot, 'ftlpu_sr_hemisphere_fabric', 'COLUMNS'),
    'lpu_mem_srf_command_integration.COLUMNS',
  )
  const depthRows = resolved(globalParameter(snapshot, 'SRAM_DEPTH_ROWS', pkg), null, 'SRAM_DEPTH_ROWS')
  const memInstructionWidth = resolved(globalParameter(snapshot, 'MEM_INSTRUCTION_WIDTH', pkg), null, 'MEM_INSTRUCTION_WIDTH')
  const nativeCommandWidth = resolved(globalParameter(snapshot, 'MEM_NATIVE_COMMAND_WIDTH', pkg), null, 'MEM_NATIVE_COMMAND_WIDTH')
  const memAddressWidth = resolved(globalParameter(snapshot, 'MEM_ADDRESS_WIDTH', pkg), null, 'MEM_ADDRESS_WIDTH')
  const memBankCount = resolved(globalParameter(snapshot, 'MEM_BANK_COUNT', pkg), null, 'MEM_BANK_COUNT')
  const mxmCount = resolved(globalParameter(snapshot, 'MXM_COUNT', pkg), null, 'MXM_COUNT')
  const sxmCount = resolved(globalParameter(snapshot, 'SXM_COUNT', pkg), null, 'SXM_COUNT')
  const vxmAluCount = resolved(globalParameter(snapshot, 'VXM_ALU_COUNT', pkg), null, 'VXM_ALU_COUNT')
  const vxmLocalQueueCount = resolved(globalParameter(snapshot, 'VXM_LOCAL_QUEUE_COUNT', pkg), null, 'VXM_LOCAL_QUEUE_COUNT')
  const mxmAccumulatorBlocks = resolved(globalParameter(snapshot, 'MXM_ACCUMULATOR_BLOCK_COUNT', pkg), null, 'MXM_ACCUMULATOR_BLOCK_COUNT')
  const streamsPerDirection = resolved(globalParameter(snapshot, 'STREAMS_PER_DIRECTION', pkg), null, 'STREAMS_PER_DIRECTION')
  const useSramMacroParameter = moduleParameter(snapshot, 'lpu_top', 'USE_SRAM_MACRO')
  const qctlParameter = moduleParameter(snapshot, 'lpu_top', 'ENABLE_QCTL')
  const qctlQueueCount = resolved(moduleParameter(snapshot, 'lpu_top', 'QCTL_QUEUE_COUNT'), null, 'QCTL_QUEUE_COUNT')
  const qctlCacheDepth = resolved(moduleParameter(snapshot, 'lpu_qctl_system', 'CACHE_DEPTH'), null, 'lpu_qctl_system.CACHE_DEPTH')
  const qctlEventDepth = resolved(moduleParameter(snapshot, 'lpu_qctl_system', 'EVENT_DEPTH'), null, 'lpu_qctl_system.EVENT_DEPTH')
  const useNativeMemParameter = moduleParameter(snapshot, 'lpu_top', 'USE_NATIVE_MEM')
  const relayDefinition = snapshot.modules?.find((item) => item.name === 'lpu_program_distribute_relay')
  const relayChainDefinition = snapshot.modules?.find((item) => item.name === 'lpu_program_distribute_relay_chain')
  const distributionNetworkDefinition = snapshot.modules?.find((item) => item.name === 'lpu_program_distribute_system')
  const topDefinition = snapshot.modules?.find((item) => item.name === 'lpu_top')
  const clusterDefinition = snapshot.modules?.find((item) => item.name === 'lpu_fu_subsystem_cluster')
  const sxmSubsystemDefinition = snapshot.modules?.find((item) => item.name === 'lpu_sxm_subsystem')
  const vxmSubsystemDefinition = snapshot.modules?.find((item) => item.name === 'lpu_vxm_subsystem')
  const requiredProgramPorts = ['program_valid_i', 'program_ready_o', 'program_control_i', 'program_destination_i', 'program_address_i', 'program_data_i', 'program_strb_i', 'program_last_i', 'program_error_o']
  const hasProgramBoundary = (definition) => requiredProgramPorts.every((port) => definition?.ports?.some((item) => item.name === port))
  const hasConnectedProgramBoundary = (instanceName) => {
    const instance = clusterDefinition?.instances?.find((item) => item.name === instanceName)
    return requiredProgramPorts.every((port) => instance?.connections?.some((item) => item.port === port))
  }
  const sxmBoundaryConnected = hasProgramBoundary(sxmSubsystemDefinition) && hasConnectedProgramBoundary('u_sxm_subsystem')
  const vxmBoundaryConnected = hasProgramBoundary(vxmSubsystemDefinition) && hasConnectedProgramBoundary('u_vxm_subsystem')
  const networkIntegrated = topDefinition?.instances?.some((item) => item.name === 'u_program_distribute_system' && item.moduleName === 'lpu_program_distribute_system') ?? false
  const relayChainIntegrated = distributionNetworkDefinition?.instances?.some((item) => item.moduleName === 'lpu_program_distribute_relay_chain') ?? false
  const relayStagesGenerated = relayChainDefinition?.instances?.some((item) => item.moduleName === 'lpu_program_distribute_relay') ?? false
  const relayIntegrated = networkIntegrated && relayChainIntegrated && relayStagesGenerated
  const relayBufferDepth = resolved(moduleParameter(snapshot, 'lpu_program_distribute_relay', 'BUFFER_DEPTH'), null, 'lpu_program_distribute_relay.BUFFER_DEPTH')
  const relayGroupsPerStage = resolved(globalParameter(snapshot, 'PROGRAM_RELAY_MEM_GROUPS_PER_STAGE', 'rtl/program_load/lpu_program_load_pkg.sv'), moduleParameter(snapshot, 'lpu_program_distribute_relay', 'MEM_GROUPS_PER_RELAY'), 'PROGRAM_RELAY_MEM_GROUPS_PER_STAGE')
  const relayCountParameter = resolved(globalParameter(snapshot, 'PROGRAM_RELAY_COUNT', 'rtl/program_load/lpu_program_load_pkg.sv'), null, 'PROGRAM_RELAY_COUNT')
  const relayPortCountParameter = resolved(globalParameter(snapshot, 'PROGRAM_RELAY_PORT_COUNT', 'rtl/program_load/lpu_program_load_pkg.sv'), null, 'PROGRAM_RELAY_PORT_COUNT')
  const useSramMacro = resolved(useSramMacroParameter, null, 'USE_SRAM_MACRO')
  const qctl = resolved(qctlParameter, null, 'ENABLE_QCTL')
  const useNativeMem = resolved(useNativeMemParameter, null, 'USE_NATIVE_MEM')
  const memCount = Number.isFinite(hemispheres.value) ? hemispheres.value : null
  const sxmTotal = sxmCount.value
  const mxmTotal = mxmCount.value
  const vxmTotal = 1
  const columnsPerMem = memColumns.value
  const banksPerMem = multiply(columnsPerMem, banksPerColumn.value)
  const slicesPerMem = multiply(banksPerMem, tileRows.value)
  const wordWidthBits = Number.isFinite(lanesPerTile.value) ? lanesPerTile.value * 8 : null
  const macroWidthBits = 64
  const macroDepthRows = 2048
  const widthBanks = divideCeil(wordWidthBits, macroWidthBits)
  const depthBanks = divideCeil(depthRows.value, macroDepthRows)
  const macrosPerSlice = multiply(widthBanks, depthBanks)
  const mappedMacrosPerMem = multiply(slicesPerMem, macrosPerSlice)
  const mappedMacrosSystem = multiply(mappedMacrosPerMem, memCount)
  const macroSelectEnabled = useSramMacro.value === 1
  const macroDefineEnabled = (snapshot.configuration?.defines ?? []).some((item) => item === 'FTLPU_USE_SRAM64X2048_MACRO' || item.startsWith('FTLPU_USE_SRAM64X2048_MACRO='))
  const physicalMacroActive = macroSelectEnabled && macroDefineEnabled
  const activeDefines = snapshot.configuration?.defines ?? []
  const mxmDotRows = activeDefines.some((item) => item === 'FTLPU_DISABLE_BLOCK8' || item.startsWith('FTLPU_DISABLE_BLOCK8=')) ? 1 : 8
  const mxmAccumulatorMacroActive = activeDefines.some((item) => item === 'FTLPU_USE_SRAM128X512_MACRO' || item.startsWith('FTLPU_USE_SRAM128X512_MACRO='))
  const activePhysicalMacros = physicalMacroActive ? mappedMacrosSystem : 0
  const frontendCount = banksPerMem
  const localControlDomains = [memCount, mxmTotal, sxmTotal, vxmTotal].every(Number.isFinite)
    ? memCount + mxmTotal + sxmTotal + vxmTotal
    : null
  const memLocalQueuesSystem = multiply(memCount, frontendCount)
  const mxmLocalQueuesSystem = multiply(mxmTotal, 3)
  const confirmedLocalQueues = [memLocalQueuesSystem, mxmLocalQueuesSystem].every(Number.isFinite)
    ? memLocalQueuesSystem + mxmLocalQueuesSystem
    : null
  const queueEntryBits = Number.isFinite(memInstructionWidth.value) ? 32 + memInstructionWidth.value : null
  const leafSramsPerBank = tileRows.value
  const leafSramsPerMem = multiply(banksPerMem, leafSramsPerBank)
  const leafSramsSystem = multiply(leafSramsPerMem, memCount)
  const memMappedStreamBoundaries = Number.isFinite(memGroups.value) ? memGroups.value + 1 : null
  const relayCountPerHemisphere = relayCountParameter.value ?? divideCeil(memGroups.value, relayGroupsPerStage.value)
  const relayTotalStages = relayPortCountParameter.value ?? multiply(hemispheres.value, relayCountPerHemisphere)
  const relayBanksPerGroup = multiply(columnsPerGroup.value, banksPerColumn.value)
  const relayStages = Array.from({ length: relayCountPerHemisphere ?? 0 }, (_, index) => {
    const groupStart = index * relayGroupsPerStage.value
    const groupEnd = Math.min(memGroups.value - 1, groupStart + relayGroupsPerStage.value - 1)
    const bankStart = groupStart * relayBanksPerGroup
    const bankEnd = (groupEnd + 1) * relayBanksPerGroup - 1
    return { index, groupStart, groupEnd, bankStart, bankEnd, bankCount: bankEnd - bankStart + 1 }
  })
  const streamColumnCountConflict = Number.isFinite(activeStreamColumns.value)
    && Number.isFinite(packageStreamColumns.value)
    && activeStreamColumns.value !== packageStreamColumns.value
  const streamRegisterStatus = streamColumnCountConflict ? 'needs-review' : 'rtl-confirmed'
  const streamRegisterMappingEvidence = source(
    'rtl/integration/lpu_mem_srf_integration.sv',
    103,
    'MEM boundary to SRF column mapping',
    'boundary b maps directly to sreg column b; MEM_BOUNDARIES <= 14 and active COLUMNS == 16',
    streamRegisterStatus,
  )

  const memEvidence = [memGroups.evidence, columnsPerGroup.evidence, memColumns.evidence, banksPerColumn.evidence, tileRows.evidence, depthRows.evidence, activeStreamColumns.evidence, packageStreamColumns.evidence]
  const macroEvidence = [
    useSramMacro.evidence,
    source('rtl/mem/lpu_mem_tile_slice_select.sv', 24, 'gen_sram', 'if (USE_SRAM_MACRO)'),
    source('rtl/mem/lpu_mem_tile_slice_sram.sv', 58, 'u_memory', 'WIDTH = LANES * 8, DEPTH = DEPTH_ROWS'),
    source('rtl/mem/lpu_sram_1rw_banked.sv', 18, 'WIDTH_BANKS', '(WIDTH + 64 - 1) / 64'),
    source('rtl/mem/lpu_sram_1rw_banked.sv', 19, 'DEPTH_BANKS', '(DEPTH + 2048 - 1) / 2048'),
    source('rtl/mem/lpu_sram_1rw_banked.sv', 75, 'FTLPU_USE_SRAM64X2048_MACRO', 'conditional physical sram_64_2048 instantiation', macroDefineEnabled ? 'rtl-confirmed' : 'needs-review'),
  ]

  const summary = [
    { id: 'hemisphere', label: 'Hemispheres', total: hemispheres.value, perHemisphere: 1, availability: 'Enabled', status: hemispheres.evidence.status, evidence: [hemispheres.evidence] },
    { id: 'mem', label: 'MEM', total: memCount, perHemisphere: 1, availability: 'Enabled', status: 'rtl-confirmed', evidence: [hemispheres.evidence] },
    { id: 'sxm', label: 'SXM', total: sxmTotal, perHemisphere: Number.isFinite(sxmTotal) && Number.isFinite(hemispheres.value) ? sxmTotal / hemispheres.value : null, availability: 'Enabled', status: sxmCount.evidence.status, evidence: [sxmCount.evidence] },
    { id: 'mxm', label: 'MXM', total: mxmTotal, perHemisphere: Number.isFinite(mxmTotal) && Number.isFinite(hemispheres.value) ? mxmTotal / hemispheres.value : null, availability: 'Enabled', status: mxmCount.evidence.status, evidence: [mxmCount.evidence] },
    { id: 'vxm', label: 'VXM', total: vxmTotal, perHemisphere: null, availability: 'Enabled', status: 'rtl-confirmed', evidence: [instanceSource(snapshot, 'lpu_fu_subsystem_cluster', 'u_vxm_subsystem', 'u_vxm_subsystem', 'single central VXM subsystem')] },
    { id: 'fu-control', label: 'FU-local Control Domains', total: localControlDomains, perHemisphere: null, availability: 'Distributed', status: 'architecture-inferred', evidence: [instanceSource(snapshot, 'lpu_fu_subsystem_cluster', 'gen_hemisphere', 'FU-local subsystem control', 'MEM, MXM and SXM are organized per hemisphere; VXM is a single central subsystem')] },
    { id: 'local-queue', label: 'FU-local Timed Queues', total: confirmedLocalQueues, perHemisphere: Number.isFinite(confirmedLocalQueues) && Number.isFinite(hemispheres.value) ? confirmedLocalQueues / hemispheres.value : null, availability: '208 MEM + 12 MXM', status: 'rtl-confirmed', evidence: [instanceSource(snapshot, 'lpu_mem_subsystem', 'u_timed_queue', 'MEM local timed queues', '104 per MEM'), instanceSource(snapshot, 'lpu_mxm_subsystem', 'u_load_timed_queue', 'MXM local timed queues', '3 per MXM')] },
    { id: 'mem-bank-queue', label: 'MEM Bank-local Queues', total: multiply(memCount, banksPerMem), perHemisphere: banksPerMem, availability: 'Global 0..207 → local 0..103', status: 'rtl-confirmed', evidence: [memBankCount.evidence, instanceSource(snapshot, 'lpu_mem_subsystem', 'u_timed_queue', 'MEM bank-local queue generate', '104 per hemisphere')] },
    { id: 'program-load-relay', label: 'Program Load Relay Stages', total: relayTotalStages, perHemisphere: relayCountPerHemisphere, availability: relayIntegrated ? 'Integrated' : 'Needs Review', status: relayIntegrated ? 'rtl-confirmed' : 'needs-review', evidence: [source(distributionNetworkDefinition?.file ?? 'rtl/program_load/lpu_program_distribute_system.sv', distributionNetworkDefinition?.instances?.find((item) => item.moduleName === 'lpu_program_distribute_relay_chain')?.line ?? 255, 'gen_relay_chain[0:1].u_program_relay_chain', 'Distribution System instantiates East + West chains and each chain generates seven Relay stages', relayIntegrated ? 'rtl-confirmed' : 'needs-review'), source('handoff/latest-rtl-change.md', 1, 'Relay-local Program Port handoff', '14 Distribution handshakes and one-Hemisphere seven-way iMEM writes verified', 'rtl-confirmed')] },
    { id: 'mem-local-program-port', label: 'MEM Local Program Ports', total: relayTotalStages, perHemisphere: relayCountPerHemisphere, availability: 'Independent Valid / Ready', status: relayIntegrated ? 'rtl-confirmed' : 'needs-review', evidence: [source('rtl/program_load/lpu_program_distribute_system.sv', 18, 'mem_program_*', 'PROGRAM_RELAY_PORT_COUNT independent MEM Program ports', relayIntegrated ? 'rtl-confirmed' : 'needs-review'), source('rtl/mem/lpu_mem_subsystem.sv', 23, 'program_valid_i / program_ready_o', 'PROGRAM_PORT_COUNT independent MEM Subsystem ports', relayIntegrated ? 'rtl-confirmed' : 'needs-review')] },
    { id: 'qctl', label: 'QCTL Formal Endpoints', total: qctlQueueCount.value, perHemisphere: null, availability: qctl.value === 1 ? 'Enabled' : 'RTL Integrated · Default Gated', status: 'rtl-confirmed', evidence: [qctl.evidence, qctlQueueCount.evidence, instanceSource(snapshot, 'lpu_fu_subsystem_cluster', 'u_qctl_system', 'gen_qctl.u_qctl_system', 'one generated lpu_qctl_system with 220 Queue endpoints')] },
  ]

  const compositions = [
    {
      id: 'mem', name: 'MEM', fu: 'mem', instanceCount: memCount, status: 'rtl-confirmed', evidence: memEvidence,
      units: [
        unit('mem-groups', 'Column Groups', 'group', 'structure', memGroups.value, memGroups.expression, memGroups.evidence),
        unit('mem-columns', 'Native Slices / MEM', 'slice', 'structure', columnsPerMem, memColumns.expression, memColumns.evidence),
        unit('mem-banks', 'Banks / MEM', 'bank', 'storage', banksPerMem, `${columnsPerMem} columns × ${banksPerColumn.value} banks`, banksPerColumn.evidence),
        unit('mem-slices', 'Native SRAM Leaves / MEM', 'sram-leaf', 'storage', leafSramsPerMem, `${columnsPerMem} slices × ${banksPerColumn.value} banks × ${leafSramsPerBank} superlanes`, source('rtl/mem_native/mem_slice.sv', 1, 'mem_slice', '2 independent banks × 4 superlane SRAM leaves')), 
        unit('mem-local-issue-paths', 'Local Instruction Frontend + Timed Queue', 'frontend-queue-pair', 'buffer', frontendCount, 'ACTIVE_COLUMNS × BANKS; one paired frontend/queue path per logical Bank', source('rtl/mem/lpu_mem_subsystem.sv', 126, 'gen_bank_frontend[*]', 'u_frontend directly enqueues u_timed_queue for the same bank-local lane'), 'rtl-confirmed', 'The local iMEM frontend, macro decode/scheduler and 96-bit timed queue form one bank-local instruction-supply path. They are displayed together south of the Native SRAM bank array.'),
        unit('mem-native-adapters', 'MEM64 → Native32 Adapters', 'adapter', 'interface', frontendCount, 'one adapter per bank-local issue lane', source('rtl/integration/lpu_mem_srf_command_integration.sv', 1, 'lpu_mem_srf_command_integration', '104 lane adapters / MEM')),
        unit(
          'mem-stream-registers',
          'Active Stream Register Columns',
          'stream-register',
          'register',
          activeStreamColumns.value,
          activeStreamColumns.expression,
          activeStreamColumns.evidence,
          streamRegisterStatus,
          streamColumnCountConflict
            ? `Active SRF instantiates ${activeStreamColumns.value} columns; lpu_pkg names ${packageStreamColumns.value}. MEM boundaries 0..${(memMappedStreamBoundaries ?? 1) - 1} map directly, column 14 is the named MXM boundary, and the remaining active column stays Needs Review.`
            : 'Bidirectional registered Stream fabric columns.',
        ),
        unit('mem-execution', 'Native MEM Hemisphere', 'execution', 'compute', 1, 'USE_NATIVE_MEM default branch', instanceSource(snapshot, 'lpu_mem_subsystem', 'u_native_execution', 'u_native_execution', 'single native integration instance')),
      ],
    },
    {
      id: 'mxm', name: 'MXM', fu: 'mxm', instanceCount: mxmTotal, status: 'rtl-confirmed', evidence: [mxmCount.evidence],
      units: [
        unit('mxm-local-issue-paths', 'Local Frontend + Timed Queue Paths', 'frontend-queue-pair', 'buffer', 3, 'Load + Dequant + Compute paired issue paths', source('rtl/mxm/lpu_mxm_subsystem.sv', 1, 'load/dequant/compute frontend + timed queue', 'Three local macro frontends directly feed their corresponding timed queues'), 'rtl-confirmed', 'Load, Dequant and Compute each retain one local frontend/queue pair before local coordination.'),
        unit('mxm-coordinator', 'Local Coordinator', 'coordinator', 'control', 1, 'one coordinator / MXM', instanceSource(snapshot, 'lpu_mxm_subsystem', 'u_coordinator', 'u_coordinator', 'single coordinator')),
        unit('mxm-control-wave', 'Four-row Execution Control Wave', 'control-wave', 'control', 1, 'one execution controller / MXM', instanceSource(snapshot, 'lpu_mxm_slice', 'u_control', 'u_control', 'load / dequant / compute commands propagate across four rows'), 'rtl-confirmed', 'The current execution slice expands Load, Dequant and Compute commands across four physical rows.'),
        unit('mxm-weight-buffer', 'Double-buffered Weight Store', 'weight-buffer', 'storage', 2, '2 buffers × 4 tiles × 4 blocks × 8 lanes × 8 columns', instanceSource(snapshot, 'lpu_mxm_slice', 'u_weight_buffer', 'u_weight_buffer', 'one double-buffered weight store / MXM')),
        unit('mxm-dequantizers', 'Tile Dequantizers', 'dequantizer', 'compute', 4, 'one generated dequantizer / tile', source('rtl/mxm/lpu_mxm_weight_buffer.sv', 28, 'gen_dequant[0:3].u_dequantizer', 'four tile-local dequantizers')),
        unit('mxm-tiles', 'Compute Tiles', 'tile', 'compute', 4, 'TILES = 4', source('rtl/mxm/lpu_mxm_compute.sv', 27, 'TILES', 'localparam integer TILES = 4')),
        unit('mxm-blocks', 'Compute Blocks', 'block', 'compute', 16, '4 tiles × 4 blocks', source('rtl/mxm/lpu_mxm_compute.sv', 28, 'BLOCKS', 'localparam integer BLOCKS = 4')),
        unit('mxm-lanes', 'Lanes / Block', 'lane', 'compute', lanesPerTile.value, lanesPerTile.expression, lanesPerTile.evidence),
        unit('mxm-dot-rows', 'Dot Rows / MXM', 'dot-row', 'compute', mxmDotRows, activeDefines.includes('FTLPU_DISABLE_BLOCK8') ? 'FTLPU_DISABLE_BLOCK8 → 1' : 'default branch → 8', source('rtl/mxm/lpu_mxm_compute.sv', 31, 'DOT_ROWS', '`ifdef FTLPU_DISABLE_BLOCK8: 1; default: 8'), 'rtl-confirmed', 'Each generated row owns one lpu_mxm_dot_bank.'),
        unit('mxm-dot-outputs', 'Dot Outputs / MXM', 'dot-output', 'compute', mxmDotRows * 4 * 8, `${mxmDotRows} rows × 4 blocks × 8 columns`, source('rtl/mxm/lpu_mxm_dot_bank.sv', 29, 'block/column loops', '32 FP32 dot outputs per generated row')),
        unit('mxm-shared-accumulator', 'Shared Accumulator Backend', 'accumulator-backend', 'storage', 1, 'one shared backend / MXM', instanceSource(snapshot, 'lpu_mxm_slice', 'u_accumulator', 'u_accumulator', 'shared vector/block accumulator backend'), 'rtl-confirmed', mxmAccumulatorMacroActive ? 'FTLPU_USE_SRAM128X512_MACRO selects 8 row banks backed by 16 physical SRAM halves.' : 'Current snapshot uses the cycle-compatible behavioral vector + block reference branch; the 8-bank SRAM macro backend is conditional.'),
        unit('mxm-accumulators', 'Accumulator Blocks', 'accumulator', 'buffer', mxmAccumulatorBlocks.value, mxmAccumulatorBlocks.expression, mxmAccumulatorBlocks.evidence),
        unit('mxm-accumulator-rows', 'Vector Accumulator Rows', 'accumulator-row', 'storage', multiply(mxmAccumulatorBlocks.value, 32), `${mxmAccumulatorBlocks.value} blocks × 32 rows`, source('rtl/mxm/lpu_mxm_accumulator.sv', 26, 'DEPTH', 'ACCUMULATOR_BLOCK_COUNT * 32')),
      ],
    },
    {
      id: 'sxm', name: 'SXM', fu: 'sxm', instanceCount: sxmTotal, status: 'rtl-confirmed', evidence: [sxmCount.evidence],
      units: [
        unit('sxm-control', 'Transpose / Permute Control', 'control', 'control', 1, 'single lpu_sxm_control', instanceSource(snapshot, 'lpu_sxm_slice', 'u_control', 'u_control', 'single control instance')),
        unit('sxm-transpose-wave', 'Transpose Control Rows', 'control-row', 'control', 4, 'lpu_control_pipeline ROWS = 4', source('rtl/sxm/lpu_sxm_control.sv', 13, 'u_transpose_pipeline', '416-bit instruction walks north through four physical tiles')),
        unit('sxm-permute-register', 'Permute Control Register', 'control-register', 'register', 1, 'one full-bank registered operation', source('rtl/sxm/lpu_sxm_control.sv', 22, 'permute_valid_o', 'single-cycle registered Permute control')),
        unit('sxm-tiles', 'Tiles', 'tile', 'compute', 4, 'TILES = 4', source('rtl/sxm/lpu_sxm_slice.sv', 24, 'TILES', 'localparam integer TILES = 4')),
        unit('sxm-planes', 'Transpose Planes', 'plane', 'buffer', 2, 'PLANES = 2', source('rtl/sxm/lpu_sxm_slice.sv', 26, 'PLANES', 'localparam integer PLANES = 2')),
        unit('sxm-rows', 'Rows / Tile', 'row', 'compute', 8, 'ROWS = 8', source('rtl/sxm/lpu_sxm_slice.sv', 25, 'ROWS', 'localparam integer ROWS = 8')),
        unit('sxm-lanes', 'Lanes / Row', 'lane', 'compute', 8, 'LANES = 8', source('rtl/sxm/lpu_sxm_slice.sv', 28, 'LANES', 'localparam integer LANES = 8')),
        unit('sxm-transpose-cells', 'Transpose Byte Cells / SXM', 'register-cell', 'storage', 512, '2 planes × 8 captured lanes × 4 tiles × 8 rows', source('rtl/sxm/lpu_sxm_slice.sv', 33, 'transpose_bank_q', '8-bit register array; not an SRAM macro')),
        unit('sxm-selector-entries', 'Destination Selector Entries', 'selector-entry', 'register', 64, '4 tiles × 16 selected streams', source('rtl/sxm/lpu_sxm_slice.sv', 35, 'bank_destination_q', '6-bit destination selector table')),
        unit('sxm-pass-registers', 'Pass-through Stream Registers', 'stream-register', 'register', 256, '2 directions × 4 tiles × 32 streams', source('rtl/sxm/lpu_sxm_slice.sv', 46, 'east_pass_* / west_pass_*', 'one-cycle boundary-14 pass-through registers')),
        unit('sxm-streams', 'Streams / Tile / Direction', 'stream', 'interface', streamsPerDirection.value, streamsPerDirection.expression, streamsPerDirection.evidence),
        unit('sxm-program-endpoint', 'Program Endpoint Adapter', 'missing-adapter', 'interface', null, 'Boundary connected; local iMEM / fetch transport missing', source('rtl/sxm/lpu_sxm_subsystem.sv', 30, 'program_ready_o', "constant 1'b0; no Commit path", 'needs-review'), 'needs-review'),
      ],
    },
    {
      id: 'vxm', name: 'VXM', fu: 'vxm', instanceCount: vxmTotal, status: 'rtl-confirmed', evidence: [instanceSource(snapshot, 'lpu_vxm_subsystem', 'u_execution', 'u_execution', 'single VXM slice')],
      units: [
        unit('vxm-control', 'Vector Control', 'control', 'control', 1, 'single lpu_vxm_control', instanceSource(snapshot, 'lpu_vxm_slice', 'u_control', 'u_control', 'single control instance')),
        unit('vxm-local-queues', 'Local Instruction Queues', 'local-queue', 'control', vxmLocalQueueCount.value, vxmLocalQueueCount.expression, vxmLocalQueueCount.evidence),
        unit('vxm-global-config', 'Global Configuration Channel', 'global-config', 'control', 1, 'one 15-bit global config channel', source('rtl/core/lpu_pkg.sv', 46, 'VXM_GLOBAL_CONFIG_WIDTH', '15-bit flow / chain / width / dtype configuration')),
        unit('vxm-control-waves', 'Four-row Control Waves', 'control-wave', 'register', 9, '8 local waves + 1 global wave; each has 4 rows', source('rtl/vxm/lpu_vxm_control.sv', 53, 'u_global_wave + gen_local_wave[0:7]', 'nine lpu_control_pipeline instances, ROWS = 4')),
        unit('vxm-stream-bridge', 'Two-hemisphere Stream Bridge', 'stream-bridge', 'interface', 1, '2 hemispheres × 4 tiles × 32 streams', instanceSource(snapshot, 'lpu_vxm_slice', 'u_stream_bridge', 'u_stream_bridge', 'one central direction-aware stream bridge')),
        unit('vxm-tiles', 'Vector Tiles', 'tile', 'compute', tileRows.value, 'TILES = 4', source('rtl/vxm/lpu_vxm_slice.sv', 39, 'TILES', 'localparam integer TILES = 4')),
        unit('vxm-lanes', 'Lanes / Tile', 'lane', 'compute', lanesPerTile.value, lanesPerTile.expression, lanesPerTile.evidence),
        unit('vxm-alus', 'ALU Stages / Lane', 'alu', 'compute', vxmAluCount.value, vxmAluCount.expression, vxmAluCount.evidence),
        unit('vxm-alu-cells', 'Lane-ALU Cells / VXM', 'alu-cell', 'compute', multiply(tileRows.value, lanesPerTile.value, vxmAluCount.value), `${tileRows.value} tiles × ${lanesPerTile.value} lanes × ${vxmAluCount.value} stages`, source('rtl/vxm/lpu_vxm_tile_execution.sv', 2, 'STAGES', 'VXM_ALU_COUNT')),
        unit('vxm-stream-blocks', 'Stream Blocks / Tile', 'stream-block', 'compute', divideCeil(vxmAluCount.value, 2), 'STAGES / 2', source('rtl/vxm/lpu_vxm_tile_execution.sv', 101, 'STREAM_BLOCKS', 'STAGES / 2')),
        unit('vxm-lut-functions', 'LUT Functions / Tile', 'lut-function', 'storage', 4, 'LUT_FUNCTIONS = 4', source('rtl/vxm/lpu_vxm_slice.sv', 44, 'LUT_FUNCTIONS', 'four independently addressed functions per tile')),
        unit('vxm-lut', 'Lane LUT SRAMs / VXM', 'lut-sram', 'storage', multiply(tileRows.value, 4, lanesPerTile.value), `${tileRows.value} tiles × 4 functions × ${lanesPerTile.value} lanes`, source('rtl/vxm/lpu_vxm_tile_lut.sv', 51, 'SRAM_COUNT', 'FUNCTION_COUNT * LANES')),
        unit('vxm-lut-entries', 'LUT Entries / VXM', 'lut-entry', 'storage', multiply(tileRows.value, 4, lanesPerTile.value, 64), `${tileRows.value} tiles × 4 functions × ${lanesPerTile.value} lanes × 64 entries`, source('rtl/vxm/lpu_vxm_lut_sram.sv', 7, 'ENTRY_COUNT', '64 entries per lane-local LUT SRAM')),
        unit('vxm-program-endpoint', 'Program Endpoint Adapter', 'missing-adapter', 'interface', null, 'Central boundary connected; resident-config adapter missing', source('rtl/vxm/lpu_vxm_subsystem.sv', 30, 'program_ready_o', "constant 1'b0; no Commit path", 'needs-review'), 'needs-review'),
      ],
    },
    {
      id: 'instruction', name: 'Distributed FU-local Instruction Control', fu: 'control', instanceCount: localControlDomains, status: 'architecture-inferred', evidence: [instanceSource(snapshot, 'lpu_mem_subsystem', 'u_frontend', 'MEM FU-local control', 'local iMEM frontend + macro decode + timed queue'), instanceSource(snapshot, 'lpu_mxm_subsystem', 'u_load_frontend', 'MXM FU-local control', 'three local macro frontends + timed queues')],
      units: [
        unit('distributed-mem-issue-paths', 'MEM Bank-local Frontend + Queue Paths', 'frontend-queue-pair', 'buffer', memLocalQueuesSystem, `${memCount} MEM × ${frontendCount} paired bank-local paths`, source('rtl/mem/lpu_mem_subsystem.sv', 126, 'gen_bank_frontend[*]', '208 system-wide paired frontend/timed-queue lanes')),
        unit('distributed-mxm-issue-paths', 'MXM Local Frontend + Queue Paths', 'frontend-queue-pair', 'buffer', mxmLocalQueuesSystem, `${mxmTotal} MXM × 3 paired local paths`, source('rtl/mxm/lpu_mxm_subsystem.sv', 1, 'local frontend/queue paths', '12 system-wide paired MXM issue paths')),
        unit('distributed-sxm-control', 'SXM Local Control Domains', 'local-control', 'control', sxmTotal, `${sxmTotal} SXM subsystems`, instanceSource(snapshot, 'lpu_sxm_subsystem', 'u_slice', 'SXM local issue/control', 'Program Load closure remains VERIFY_REQUIRED'), 'needs-review', 'Program Load to local instruction storage is not confirmed in the current cluster routing.'),
        unit('distributed-vxm-control', 'VXM Local Control Domain', 'local-control', 'control', vxmTotal, 'single central VXM subsystem', instanceSource(snapshot, 'lpu_vxm_subsystem', 'u_slice', 'VXM local/global issue control', 'Program Load closure remains VERIFY_REQUIRED'), 'needs-review', 'Program Load to local instruction storage is not confirmed in the current cluster routing.'),
        unit('distributed-qctl', 'QCTL Formal Endpoint Map · 220', 'queue-control-system', 'control', qctlQueueCount.value, qctlQueueCount.expression, qctlQueueCount.evidence, 'rtl-confirmed', 'MEM 0..207 and MXM Load / Dequant / Compute 208..219 are formal endpoints generated inside lpu_qctl_system. VXM and SXM have no formal QCTL Queue number or Controller chain in the current RTL.'),
      ],
    },
  ]

  const layoutByComposition = {
    mem: {
      tiers: [['mem-execution'], ['mem-slices'], ['mem-banks'], ['mem-columns'], ['mem-groups'], ['mem-native-adapters', 'mem-stream-registers'], ['mem-local-issue-paths']],
      links: [
        ['mem-groups', 'mem-columns', 'Group contains columns'],
        ['mem-columns', 'mem-banks', 'Column contains banks'],
        ['mem-banks', 'mem-slices', 'Bank contains superlane SRAM leaves'],
        ['mem-local-issue-paths', 'mem-native-adapters', 'South → North · 64-bit MEM machine code'],
        ['mem-native-adapters', 'mem-execution', 'Private 32-bit Native command'],
        ['mem-stream-registers', 'mem-execution', 'Stream ingress / egress'],
      ],
    },
    mxm: {
      tiers: [['mxm-local-issue-paths'], ['mxm-coordinator', 'mxm-control-wave'], ['mxm-weight-buffer', 'mxm-dequantizers'], ['mxm-tiles', 'mxm-dot-rows'], ['mxm-blocks', 'mxm-lanes', 'mxm-dot-outputs'], ['mxm-shared-accumulator', 'mxm-accumulators', 'mxm-accumulator-rows']],
      links: [
        ['mxm-local-issue-paths', 'mxm-coordinator', 'Load / Dequant / Compute timed issue'],
        ['mxm-coordinator', 'mxm-control-wave', 'Accepted issue'],
        ['mxm-control-wave', 'mxm-weight-buffer', 'Load / Dequant row control'],
        ['mxm-control-wave', 'mxm-tiles', 'Compute row control'],
        ['mxm-weight-buffer', 'mxm-tiles', 'BF16 / FP16 weights'],
        ['mxm-tiles', 'mxm-shared-accumulator', '8 × 32 FP32 partial results'],
      ],
    },
    sxm: {
      tiers: [['sxm-program-endpoint'], ['sxm-control', 'sxm-streams'], ['sxm-transpose-wave', 'sxm-permute-register', 'sxm-pass-registers'], ['sxm-tiles'], ['sxm-planes', 'sxm-rows', 'sxm-lanes'], ['sxm-transpose-cells', 'sxm-selector-entries']],
      links: [
        ['sxm-control', 'sxm-transpose-wave', '416-bit Transpose wave'],
        ['sxm-control', 'sxm-permute-register', '416-bit Permute control'],
        ['sxm-streams', 'sxm-pass-registers', 'Uncaptured streams'],
        ['sxm-streams', 'sxm-tiles', 'Selected Transpose inputs'],
        ['sxm-transpose-wave', 'sxm-tiles', 'Tile capture enable'],
        ['sxm-permute-register', 'sxm-tiles', 'Bank read / lane permutation'],
        ['sxm-tiles', 'sxm-streams', 'Permuted stream outputs'],
      ],
    },
    vxm: {
      tiers: [['vxm-program-endpoint'], ['vxm-local-queues', 'vxm-global-config'], ['vxm-control', 'vxm-control-waves'], ['vxm-stream-bridge'], ['vxm-tiles'], ['vxm-lanes', 'vxm-alus', 'vxm-stream-blocks'], ['vxm-alu-cells', 'vxm-lut-functions', 'vxm-lut', 'vxm-lut-entries']],
      links: [
        ['vxm-local-queues', 'vxm-control', '8 heterogeneous local instructions'],
        ['vxm-global-config', 'vxm-control', '15-bit global configuration'],
        ['vxm-control', 'vxm-control-waves', 'Registered four-row propagation'],
        ['vxm-control-waves', 'vxm-tiles', 'Configure then fixed execute pulse'],
        ['vxm-stream-bridge', 'vxm-tiles', 'Direction-selected stream ingress'],
        ['vxm-lut', 'vxm-tiles', 'Lane-local lookup response'],
        ['vxm-tiles', 'vxm-stream-bridge', 'Vector result egress'],
      ],
    },
    instruction: {
      tiers: [['distributed-mem-issue-paths', 'distributed-mxm-issue-paths'], ['distributed-sxm-control', 'distributed-vxm-control'], ['distributed-qctl']],
      links: [
        ['distributed-mem-issue-paths', 'distributed-qctl', 'Optional MEM lane map · 0..207'],
        ['distributed-mxm-issue-paths', 'distributed-qctl', 'Optional MXM lane map · 208..219'],
      ],
    },
  }
  for (const composition of compositions) {
    const layout = layoutByComposition[composition.id] ?? { tiers: [composition.units.map((item) => item.id)], links: [] }
    const tierMap = new Map(layout.tiers.flatMap((ids, tier) => ids.map((id) => [id, tier])))
    composition.units = composition.units.map((item) => ({ ...item, tier: tierMap.get(item.id) ?? 0 }))
    composition.links = layout.links.map(([sourceUnitId, targetUnitId, label], index) => {
      const statuses = [sourceUnitId, targetUnitId].map((id) => composition.units.find((item) => item.id === id)?.status)
      const status = statuses.includes('needs-review') ? 'needs-review' : statuses.includes('partially-verified') ? 'partially-verified' : 'rtl-confirmed'
      return { id: `${composition.id}:composition-link:${index}`, sourceUnitId, targetUnitId, label, status }
    })
  }

  const stage = (id, name, role, file, line, symbol, expression, status = 'rtl-confirmed') => ({
    id,
    name,
    role,
    status,
    specs: [],
    evidence: [source(file, line, symbol, expression, status)],
  })
  const frontends = [
    {
      id: 'mem',
      label: 'MEM Frontend',
      fu: 'mem',
      instanceCount: frontendCount,
      status: 'rtl-confirmed',
      integration: 'Integrated · one bank-local path per MEM Bank',
      summary: 'Program words are stored in a Bank-local iMEM, fetched into a Word FIFO, macro-decoded and scheduled before entering the matching Bank Timed Queue.',
      variants: [{
        id: 'mem-bank',
        name: 'Bank-local Macro Frontend',
        count: frontendCount,
        status: 'rtl-confirmed',
        stages: [
          stage('mem-imem', 'Local iMEM', 'FU-local program storage', 'rtl/mem/lpu_mem_local_imem_frontend.sv', 115, 'u_imem', 'lpu_mem_local_imem'),
          stage('mem-fetch', 'iMEM Fetch', 'Committed-word fetch and program counter', 'rtl/mem/lpu_mem_local_imem_frontend.sv', 140, 'u_fetch', 'lpu_mem_imem_fetch'),
          stage('mem-word-fifo', 'Word FIFO', 'Absorbs iMEM latency', 'rtl/mem/lpu_mem_macro_frontend.sv', 83, 'u_word_fifo', 'lpu_queue_fifo'),
          stage('mem-decoder', 'MEM Macro Decoder', '12-state architectural FSM · Queue-driven IDLE completion', 'rtl/mem/lpu_mem_macro_frontend.sv', 98, 'u_decoder', 'lpu_mem_macro_decoder'),
          stage('mem-context-fifo', 'Context FIFO', 'Decouples decode from admission', 'rtl/mem/lpu_mem_macro_frontend.sv', 130, 'u_context_fifo', 'lpu_queue_fifo'),
          stage('mem-scheduler', 'MEM Macro Scheduler', 'Expands Context into timed base instructions', 'rtl/mem/lpu_mem_macro_frontend.sv', 146, 'u_scheduler', 'lpu_mem_macro_scheduler'),
          stage('mem-timed-queue', 'Frontend Instruction Queue', 'Final sequential stage inside each MEM Frontend', 'rtl/mem/lpu_mem_local_imem_frontend.sv', 217, 'u_instruction_queue', 'lpu_mem_instruction_queue'),
        ],
      }],
      evidence: [source('rtl/mem/lpu_mem_subsystem.sv', 163, 'gen_bank_frontend[*].u_frontend', 'one complete bank-local Frontend per logical MEM Bank'), source('rtl/mem/lpu_mem_local_imem_frontend.sv', 217, 'u_instruction_queue', 'Instruction Queue is the final stage inside each Frontend')],
    },
    {
      id: 'mxm',
      label: 'MXM Frontend',
      fu: 'mxm',
      instanceCount: 3,
      status: 'rtl-confirmed',
      integration: 'Integrated · Load / Dequant / Compute paths',
      summary: 'Each MXM owns three independent FU-local program paths. Every path has local iMEM and a queue-kind-specific macro decoder before its paired Timed Queue.',
      variants: [
        ['load', 'Load Frontend', 'lpu_mxm_load_macro_decoder', 105, 'lpu_mxm_load_macro_scheduler', 153, 239],
        ['dequant', 'Dequant Frontend', 'lpu_mxm_dequant_macro_decoder', 103, 'lpu_mxm_dequant_macro_scheduler', 150, 249],
        ['compute', 'Compute Frontend', 'lpu_mxm_compute_macro_decoder', 106, 'lpu_mxm_compute_macro_scheduler', 156, 259],
      ].map(([id, name, decoder, decoderLine, scheduler, schedulerLine, queueLine]) => ({
        id,
        name,
        count: 1,
        status: 'rtl-confirmed',
        stages: [
          stage(`${id}-imem`, 'Local iMEM', 'FU-local program storage', 'rtl/mxm/lpu_mxm_local_imem_frontend.sv', 122, 'u_imem', 'lpu_mxm_local_imem'),
          stage(`${id}-fetch`, 'iMEM Fetch', 'Committed-word fetch and program counter', 'rtl/mxm/lpu_mxm_local_imem_frontend.sv', 147, 'u_fetch', 'lpu_mxm_imem_fetch'),
          stage(`${id}-word-fifo`, 'Word FIFO', 'Buffers macro words', `rtl/mxm/lpu_mxm_${id}_macro_frontend.sv`, id === 'compute' ? 86 : id === 'load' ? 85 : 83, 'u_word_fifo', 'lpu_queue_fifo'),
          stage(`${id}-decoder`, `${name.replace(' Frontend', '')} Macro Decoder`, 'Queue-kind-specific macro decode', `rtl/mxm/lpu_mxm_${id}_macro_frontend.sv`, decoderLine, 'u_decoder', decoder),
          stage(`${id}-context-fifo`, 'Context FIFO', 'Buffers decoded Context', `rtl/mxm/lpu_mxm_${id}_macro_frontend.sv`, id === 'compute' ? 141 : id === 'load' ? 138 : 135, 'u_context_fifo', 'lpu_queue_fifo'),
          stage(`${id}-scheduler`, `${name.replace(' Frontend', '')} Scheduler`, 'Timed base-instruction expansion', `rtl/mxm/lpu_mxm_${id}_macro_frontend.sv`, schedulerLine, 'u_scheduler', scheduler),
          stage(`${id}-timed-queue`, `${name.replace(' Frontend', '')} Timed Queue`, 'Independent issue ownership', 'rtl/mxm/lpu_mxm_subsystem.sv', queueLine, `u_${id}_timed_queue`, 'lpu_mxm_issue_queue'),
        ],
      })),
      evidence: [source('rtl/mxm/lpu_mxm_subsystem.sv', 187, 'u_load_frontend', 'Load local iMEM frontend'), source('rtl/mxm/lpu_mxm_subsystem.sv', 204, 'u_dequant_frontend', 'Dequant local iMEM frontend'), source('rtl/mxm/lpu_mxm_subsystem.sv', 221, 'u_compute_frontend', 'Compute local iMEM frontend')],
    },
    {
      id: 'sxm',
      label: 'SXM Frontend',
      fu: 'sxm',
      instanceCount: null,
      status: 'needs-review',
      integration: 'RTL defined · Program Load / local-iMEM transport not integrated',
      summary: 'Transpose and Permute macro frontend modules exist and pass standalone checks, but the active SXM Subsystem does not yet instantiate the local program transport.',
      variants: [
        ['transpose', 'Transpose Frontend', 95, 110, 138, 153, 181],
        ['permute', 'Permute Frontend', 97, 112, 141, 156, 185],
      ].map(([id, name, wordLine, decoderLine, contextLine, schedulerLine, queueLine]) => ({
        id,
        name,
        count: null,
        status: 'needs-review',
        stages: [
          stage(`${id}-program-boundary`, 'Local Program Transport', 'Not integrated in current SXM Subsystem', 'rtl/sxm/lpu_sxm_subsystem.sv', 5, 'Program Load boundary', 'local-iMEM transport is not implemented yet', 'needs-review'),
          stage(`${id}-word-fifo`, 'Word FIFO', 'Buffers RUN_2D words', `rtl/sxm/lpu_sxm_${id}_macro_frontend.sv`, wordLine, 'u_word_fifo', 'lpu_queue_fifo'),
          stage(`${id}-decoder`, `${name.replace(' Frontend', '')} Macro Decoder`, 'RUN_2D macro decode', `rtl/sxm/lpu_sxm_${id}_macro_frontend.sv`, decoderLine, 'u_decoder', `lpu_sxm_${id}_macro_decoder`),
          stage(`${id}-context-fifo`, 'Context FIFO', 'Buffers decoded Context', `rtl/sxm/lpu_sxm_${id}_macro_frontend.sv`, contextLine, 'u_context_fifo', 'lpu_queue_fifo'),
          stage(`${id}-scheduler`, `${name.replace(' Frontend', '')} Scheduler`, 'Absolute-cycle expansion', `rtl/sxm/lpu_sxm_${id}_macro_frontend.sv`, schedulerLine, 'u_scheduler', `lpu_sxm_${id}_macro_scheduler`),
          stage(`${id}-issue-queue`, 'SXM Issue Queue', 'Deadline-qualified FU-local issue', `rtl/sxm/lpu_sxm_${id}_macro_frontend.sv`, queueLine, 'u_issue_queue', 'lpu_sxm_issue_queue'),
        ],
      })),
      evidence: [source('rtl/sxm/lpu_sxm_subsystem.sv', 5, 'SXM Program Load boundary', 'local-iMEM transport not implemented; Ready remains low', 'needs-review'), source('rtl/sxm/lpu_sxm_transpose_macro_frontend.sv', 1, 'lpu_sxm_transpose_macro_frontend', 'defined standalone frontend'), source('rtl/sxm/lpu_sxm_permute_macro_frontend.sv', 1, 'lpu_sxm_permute_macro_frontend', 'defined standalone frontend')],
    },
    {
      id: 'vxm',
      label: 'VXM Frontend',
      fu: 'vxm',
      instanceCount: null,
      status: 'needs-review',
      integration: 'RTL defined · resident-config / Execute endpoint not integrated',
      summary: 'The VXM macro frontend is defined as a queue-local packet/decode/schedule path, while the active VXM Subsystem keeps the Program endpoint unacknowledged.',
      variants: [{
        id: 'vxm-config',
        name: 'VXM Config Frontend',
        count: null,
        status: 'needs-review',
        stages: [
          stage('vxm-program-boundary', 'Resident Config Adapter', 'Not integrated in current VXM Subsystem', 'rtl/vxm/lpu_vxm_subsystem.sv', 5, 'Program Load boundary', 'resident-config/Execute endpoint is not implemented yet', 'needs-review'),
          stage('vxm-word-fifo', 'Word FIFO', 'Buffers RUN_2D packet words', 'rtl/vxm/lpu_vxm_macro_frontend.sv', 107, 'u_word_fifo', 'lpu_queue_fifo'),
          stage('vxm-decoder', 'VXM Macro Decoder', 'RUN_2D macro decode', 'rtl/vxm/lpu_vxm_macro_frontend.sv', 122, 'u_decoder', 'lpu_vxm_macro_decoder'),
          stage('vxm-context-fifo', 'Context FIFO', 'Buffers decoded Context', 'rtl/vxm/lpu_vxm_macro_frontend.sv', 152, 'u_context_fifo', 'lpu_queue_fifo'),
          stage('vxm-scheduler', 'VXM Macro Scheduler', 'Absolute-cycle Compact Config expansion', 'rtl/vxm/lpu_vxm_macro_frontend.sv', 167, 'u_scheduler', 'lpu_vxm_macro_scheduler'),
          stage('vxm-timed-queue', 'VXM Timed Issue Queue', 'Deadline-qualified Compact issue', 'rtl/vxm/lpu_vxm_macro_frontend.sv', 196, 'u_timed_issue_queue', 'lpu_vxm_timed_issue_queue'),
        ],
      }],
      evidence: [source('rtl/vxm/lpu_vxm_subsystem.sv', 5, 'VXM Program Load boundary', 'resident-config/Execute endpoint not implemented; request not acknowledged', 'needs-review'), source('rtl/vxm/lpu_vxm_macro_frontend.sv', 3, 'lpu_vxm_macro_frontend', 'defined standalone frontend')],
    },
  ]

  const spec = (label, value, status = 'rtl-confirmed') => ({ label, value, status })
  const frontendStageSpecs = new Map()
  const setSpecs = (id, items) => frontendStageSpecs.set(id, items)

  setSpecs('mem-imem', [spec('Program words', '131,072'), spec('Word width', '96 bit'), spec('Address width', '17 bit'), spec('Response buffering', '4 entries')])
  setSpecs('mem-fetch', [spec('Fetch range', '131,072 words'), spec('Word width', '96 bit'), spec('Ordering', 'In order'), spec('Completion', 'Last-word tagged')])
  setSpecs('mem-word-fifo', [spec('Depth', '4 entries'), spec('Entry width', '97 bit'), spec('Contents', '96-bit macro word + last')])
  setSpecs('mem-decoder', [
    spec('Input', '96-bit packed-v1 macro word'),
    spec('Output', '271-bit Context'),
    spec('Controller', 'Architectural FSM · 12 RTL states'),
    spec('Control[0]', 'Valid = 1'),
    spec('Completion', 'IDLE / IDLE_GLOBAL with zero Macro count'),
    spec('Control[3:2]', "Mode = 2'b01"),
    spec('Control[27:4]', 'Command Count · 24 bit'),
    spec('Context Valid', 'OUTPUT_CONTEXT until handshake'),
  ])
  setSpecs('mem-context-fifo', [spec('Depth', '4 entries'), spec('Entry width', '271 bit'), spec('Contents', 'Decoded MEM Context')])
  setSpecs('mem-scheduler', [spec('Active contexts', '4'), spec('Issue lookahead', '2 cycles'), spec('Internal issue FIFO', 'None · queue is the register boundary'), spec('Output instruction', '64 bit')])
  setSpecs('mem-timed-queue', [spec('Depth', '16 entries'), spec('Entry width', '96 bit'), spec('Contents', '32-bit cycle + 64-bit instruction')])

  const mxmContextWidths = { load: 257, dequant: 242, compute: 288 }
  for (const id of ['load', 'dequant', 'compute']) {
    const contextWidth = mxmContextWidths[id]
    setSpecs(`${id}-imem`, [spec('Program words', '65,536'), spec('Word width', '128 bit'), spec('Address width', '16 bit'), spec('Response buffering', '4 entries')])
    setSpecs(`${id}-fetch`, [spec('Fetch range', '65,536 words'), spec('Word width', '128 bit'), spec('Ordering', 'In order'), spec('Completion', 'Last-word tagged')])
    setSpecs(`${id}-word-fifo`, [spec('Depth', '4 entries'), spec('Entry width', '129 bit'), spec('Contents', '128-bit macro word + last')])
    setSpecs(`${id}-decoder`, [spec('Input', '128-bit macro word'), spec('Output', `${contextWidth}-bit Context`), spec('Operation', `${id[0].toUpperCase()}${id.slice(1)} macro decode`)])
    setSpecs(`${id}-context-fifo`, [spec('Depth', '4 entries'), spec('Entry width', `${contextWidth} bit`), spec('Contents', 'Decoded MXM Context')])
    setSpecs(`${id}-scheduler`, [spec('Active contexts', '4'), spec('Issue lookahead', '2 cycles'), spec('Internal issue FIFO', 'None · queue is the register boundary'), spec('Output instruction', '49 bit')])
    setSpecs(`${id}-timed-queue`, [spec('Depth', '16 entries'), spec('Entry width', '81 bit'), spec('Contents', '32-bit cycle + 49-bit instruction')])
  }

  const sxmContextWidths = { transpose: 608, permute: 613 }
  for (const id of ['transpose', 'permute']) {
    const contextWidth = sxmContextWidths[id]
    setSpecs(`${id}-program-boundary`, [spec('Endpoint', 'Not integrated', 'needs-review'), spec('Program acceptance', 'Disabled', 'needs-review')])
    setSpecs(`${id}-word-fifo`, [spec('Depth', '4 entries'), spec('Entry width', '97 bit'), spec('Contents', '96-bit RUN_2D word + last')])
    setSpecs(`${id}-decoder`, [spec('Input', '96-bit macro word'), spec('Output', `${contextWidth}-bit Context`), spec('Operation', `${id[0].toUpperCase()}${id.slice(1)} macro decode`)])
    setSpecs(`${id}-context-fifo`, [spec('Depth', '2 entries'), spec('Entry width', `${contextWidth} bit`), spec('Contents', 'Decoded SXM Context')])
    setSpecs(`${id}-scheduler`, [spec('Active contexts', '1'), spec('Issue lookahead', '2 cycles'), spec('Internal issue FIFO', 'None · queue is the register boundary'), spec('Output instruction', '416 bit'), spec('Timing', 'Absolute-cycle expansion')])
    setSpecs(`${id}-issue-queue`, [spec('Depth', '4 entries'), spec('Entry width', '448 bit'), spec('Contents', '32-bit cycle + 416-bit instruction')])
  }

  setSpecs('vxm-program-boundary', [spec('Endpoint', 'Not integrated', 'needs-review'), spec('Program acceptance', 'Disabled', 'needs-review')])
  setSpecs('vxm-word-fifo', [spec('Depth', '4 entries'), spec('Entry width', '97 bit'), spec('Contents', '96-bit RUN_2D word + last')])
  setSpecs('vxm-decoder', [spec('Input', '96-bit macro word'), spec('Output', '288-bit Context'), spec('Local queue', '0')])
  setSpecs('vxm-context-fifo', [spec('Depth', '2 entries'), spec('Entry width', '288 bit'), spec('Contents', 'Decoded VXM Context')])
  setSpecs('vxm-scheduler', [spec('Active contexts', '1'), spec('Issue lookahead', '2 cycles'), spec('Internal issue FIFO', 'None · queue is the register boundary'), spec('Output instruction', '128 bit'), spec('Timing', 'Absolute-cycle expansion')])
  setSpecs('vxm-timed-queue', [spec('Depth', '4 entries'), spec('Entry width', '128 bit'), spec('Contents', 'Compact timed issue record')])

  const specValue = (item, label, fallback) => item.specs.find((entry) => entry.label === label)?.value ?? fallback
  const decoderPipeline = (frontend, variant, item) => {
    const compressedStream = frontend.id === 'mem' || frontend.id === 'mxm'
    const input = specValue(item, 'Input', 'Macro word stream')
    const output = specValue(item, 'Output', 'Decoded Context')
    if (frontend.id === 'mem') return {
      kind: 'decoder',
      visualization: 'state-machine',
      title: 'MEM Macro Decoder 状态转移图',
      stateBadge: '12 RTL STATES · CURRENT LOCAL RTL',
      summary: '首个 Macro 先完成全局控制、字典和初始状态装载；后续 Macro 在 Run、Template、Delta 与 Context 输出之间循环。',
      inputLabel: `${input} · ready/valid from Word FIFO · bit zero consumed first`,
      outputLabel: `${output} · ready/valid to Context FIFO`,
      timingNote: '图中重复的 Run、Template、Output 框是同一 RTL 状态在首个 Macro 与后续循环中的路径视图；Queue Macro 计数清零后，IDLE 自循环并令 done_o=1。',
      steps: [
        { id: 'idle-global', name: 'IDLE_GLOBAL', description: '等待并检查全局控制字。', boundary: 'IDLE_GLOBAL', tone: 'idle', rtlStates: ['IDLE_GLOBAL'], position: { x: 520, y: 40, width: 230, height: 100 } },
        { id: 'fault-global', name: 'FAULT', description: '控制字非法；错误保持至复位。', boundary: 'FAULT', tone: 'fault', rtlStates: ['FAULT'], position: { x: 870, y: 40, width: 210, height: 100 } },
        { id: 'dict-store', name: 'DICT_STORE', description: '装载 Delta 字典数量与条目。', boundary: 'DICT_STORE', tone: 'dictionary', rtlStates: ['DICT_STORE'], position: { x: 520, y: 180, width: 230, height: 100 } },
        { id: 'init-global', name: 'INIT_GLOBAL', description: '建立首个绝对周期与地址。', boundary: 'INIT_GLOBAL', tone: 'main', rtlStates: ['INIT_GLOBAL'], position: { x: 520, y: 320, width: 230, height: 100 } },
        { id: 'run-header-first', name: 'RUN_HEADER', description: '解析首个 Run 的标志与长度。', boundary: 'RUN_HEADER', tone: 'main', rtlStates: ['RUN_HEADER'], position: { x: 520, y: 460, width: 230, height: 100 } },
        { id: 'template-first', name: 'TEMPLATE', description: '解析并校验首个指令模板。', boundary: 'TEMPLATE', tone: 'main', rtlStates: ['TEMPLATE'], position: { x: 520, y: 600, width: 230, height: 100 } },
        { id: 'output-first', name: 'OUTPUT_CONTEXT', description: '输出首个 Macro 的 Context。', boundary: 'OUTPUT_CONTEXT', tone: 'main', rtlStates: ['OUTPUT_CONTEXT'], position: { x: 520, y: 740, width: 230, height: 100 } },
        { id: 'fault-runtime', name: 'FAULT', description: '解析非法或输入截断；保持至复位。', boundary: 'FAULT', tone: 'fault', rtlStates: ['FAULT'], position: { x: 40, y: 900, width: 210, height: 100 } },
        { id: 'idle', name: 'IDLE', description: 'Run 边界；Queue 空时保持并置 done_o。', boundary: 'IDLE', tone: 'idle', rtlStates: ['IDLE'], position: { x: 330, y: 900, width: 230, height: 100 } },
        { id: 'run-header-next', name: 'RUN_HEADER', description: 'Queue 非空时解析下一 Run。', boundary: 'RUN_HEADER', tone: 'main', rtlStates: ['RUN_HEADER'], position: { x: 650, y: 900, width: 230, height: 100 } },
        { id: 'template-next', name: 'TEMPLATE', description: '解析后续 Macro 的模板。', boundary: 'TEMPLATE', tone: 'main', rtlStates: ['TEMPLATE'], position: { x: 970, y: 900, width: 230, height: 100 } },
        { id: 'get-delta', name: 'GET_DELTA', description: '解析 Delta 前缀并选择来源。', boundary: 'GET_DELTA', tone: 'main', rtlStates: ['GET_DELTA'], position: { x: 1290, y: 900, width: 230, height: 100 } },
        { id: 'escape', name: 'ESCAPE', description: '读取 Compact 或 Wide Delta。', boundary: 'ESCAPE', tone: 'escape', rtlStates: ['ESCAPE'], position: { x: 1600, y: 740, width: 230, height: 100 } },
        { id: 'dict-lookup', name: 'DICT_LOOKUP', description: '按 Symbol 读取已装载 Delta。', boundary: 'DICT_LOOKUP', tone: 'dictionary', rtlStates: ['DICT_LOOKUP'], position: { x: 1600, y: 1040, width: 230, height: 100 } },
        { id: 'apply-delta', name: 'APPLY_DELTA', description: '累加周期和地址并生成 Context。', boundary: 'APPLY_DELTA', tone: 'main', rtlStates: ['APPLY_DELTA'], position: { x: 1920, y: 900, width: 230, height: 100 } },
        { id: 'output-loop', name: 'OUTPUT_CONTEXT', description: '保持有效 Context，等待下游握手。', boundary: 'OUTPUT_CONTEXT', tone: 'main', rtlStates: ['OUTPUT_CONTEXT'], position: { x: 2250, y: 900, width: 230, height: 100 } },
      ],
      transitions: [
        { id: 'global-wait', source: 'idle-global', target: 'idle-global', label: '等待控制字 / Macro 数为 0', sourceHandle: 'top-source', targetHandle: 'top-target', tone: 'loop', offset: 48 },
        { id: 'global-fault', source: 'idle-global', target: 'fault-global', label: '控制字非法', sourceHandle: 'right-source', targetHandle: 'left-target', tone: 'fault' },
        { id: 'global-dict', source: 'idle-global', target: 'dict-store', label: '控制合法 · Macro 数 > 0', sourceHandle: 'bottom-source-center', targetHandle: 'top-target-center' },
        { id: 'dict-init', source: 'dict-store', target: 'init-global', label: '无需字典 / 装载完成', sourceHandle: 'bottom-source-center', targetHandle: 'top-target-center', tone: 'dictionary' },
        { id: 'init-run-first', source: 'init-global', target: 'run-header-first', label: '初始字段完整', sourceHandle: 'bottom-source-center', targetHandle: 'top-target-center' },
        { id: 'run-template-first', source: 'run-header-first', target: 'template-first', label: 'Run 长度合法', sourceHandle: 'bottom-source-center', targetHandle: 'top-target-center' },
        { id: 'template-output-first', source: 'template-first', target: 'output-first', label: '首个 Macro · 校验通过', sourceHandle: 'bottom-source-center', targetHandle: 'top-target-center' },
        { id: 'first-output-delta', source: 'output-first', target: 'get-delta', label: '握手完成 · Run 中仍有 Macro', sourceHandle: 'right-source', targetHandle: 'top-target-center', tone: 'loop', offset: 54 },
        { id: 'first-output-idle', source: 'output-first', target: 'idle', label: '首个 Run 结束', sourceHandle: 'left-source', targetHandle: 'top-target-center', tone: 'loop', offset: 60 },
        { id: 'runtime-fault-summary', source: 'idle', target: 'fault-runtime', label: '解析非法 / 输入截断（汇总）', sourceHandle: 'top-source', targetHandle: 'top-target', tone: 'fault', offset: 34 },
        { id: 'idle-complete', source: 'idle', target: 'idle', label: 'Queue Macro 数 = 0 · done_o = 1', sourceHandle: 'bottom-source-right', targetHandle: 'bottom-target', tone: 'loop', offset: 54 },
        { id: 'idle-next-run', source: 'idle', target: 'run-header-next', label: 'Queue 中仍有 Macro', sourceHandle: 'top-source', targetHandle: 'top-target', offset: 30 },
        { id: 'run-template-next', source: 'run-header-next', target: 'template-next', label: 'Run 长度合法', sourceHandle: 'top-source', targetHandle: 'top-target', offset: 30 },
        { id: 'template-delta-next', source: 'template-next', target: 'get-delta', label: '后续 Macro · 校验通过', sourceHandle: 'top-source', targetHandle: 'top-target', offset: 30 },
        { id: 'delta-escape', source: 'get-delta', target: 'escape', label: 'Escape Symbol', sourceHandle: 'top-source', targetHandle: 'left-target', tone: 'escape' },
        { id: 'delta-dictionary', source: 'get-delta', target: 'dict-lookup', label: '匹配字典条目', sourceHandle: 'bottom-source-right', targetHandle: 'left-target', tone: 'dictionary' },
        { id: 'escape-apply', source: 'escape', target: 'apply-delta', label: 'Payload 完整', sourceHandle: 'right-source', targetHandle: 'top-target-center', tone: 'escape' },
        { id: 'dictionary-apply', source: 'dict-lookup', target: 'apply-delta', label: '取得 Delta', sourceHandle: 'right-source', targetHandle: 'bottom-target', tone: 'dictionary' },
        { id: 'apply-output', source: 'apply-delta', target: 'output-loop', label: '累加结果有效', sourceHandle: 'right-source', targetHandle: 'left-target' },
        { id: 'output-wait', source: 'output-loop', target: 'output-loop', label: '等待下游 Ready', sourceHandle: 'top-source', targetHandle: 'top-target', tone: 'loop', offset: 46 },
        { id: 'output-delta', source: 'output-loop', target: 'get-delta', label: '握手完成 · Run 中仍有 Macro', sourceHandle: 'bottom-source-left', targetHandle: 'bottom-target', tone: 'loop', offset: 170 },
        { id: 'output-idle', source: 'output-loop', target: 'idle', label: '握手完成 · Run 结束', sourceHandle: 'bottom-source-right', targetHandle: 'bottom-target', tone: 'loop', offset: 245 },
      ],
    }
    return {
      kind: 'decoder',
      title: `${item.name} · ${compressedStream ? 'Decompression' : 'Packet Decode'} Pipeline`,
      summary: compressedStream
        ? 'Macro words are consumed by a state-machine parser. A cross-word reservoir, dictionary/template decode and delta reconstruction produce one normalized scheduling Context.'
        : 'RUN_2D packet words are collected, reordered into one logical payload, validated and converted into one normalized scheduling Context.',
      inputLabel: `${input} · ready/valid from Word FIFO`,
      outputLabel: `${output} · ready/valid to Context FIFO`,
      timingNote: compressedStream
        ? 'Functional processing pipeline: the boxes are parser phases, not fixed one-cycle stages. The RTL uses an FSM plus a registered Context output that remains stable under backpressure.'
        : 'Functional processing pipeline: packet collection and decode_pending are registered phases; the Context output remains stable until the Context FIFO accepts it.',
      steps: compressedStream ? [
        { id: 'word-intake', name: 'Word Intake + Bit Reservoir', description: `Accept ${input} words and append them to the cross-word bit reservoir.`, boundary: 'READY / VALID · WORD_LAST' },
        { id: 'control-dictionary', name: 'Control + Delta Dictionary', description: 'Decode command count, initial state and up to seven reusable start/operand delta entries.', boundary: 'FSM · CONTROL / DICTIONARY' },
        { id: 'template-decompress', name: 'Run + Template Decompress', description: 'Expand Run length and compact/extended Template fields into native instruction and two-level loop schedule.', boundary: 'FSM · RUN / TEMPLATE' },
        { id: 'delta-normalize', name: 'Delta Apply + Normalize', description: 'Reconstruct absolute start cycle and induced operand/address, then validate target and schedule legality.', boundary: 'FSM · DELTA / VALIDATE' },
        { id: 'context-output', name: 'Registered Context Output', description: `Pack instruction, timing, count, interval, stride and target fields into ${output}.`, boundary: '1-ENTRY HOLD · BACKPRESSURE SAFE' },
      ] : [
        { id: 'word-intake', name: 'Packet Word Intake', description: `Accept ${input} words from the frontend Word FIFO.`, boundary: 'READY / VALID · WORD_LAST' },
        { id: 'packet-assembly', name: 'Logical Packet Assembly', description: 'Collect the multi-word RUN_2D packet and close physical header/subtype gaps into one logical payload.', boundary: 'REGISTERED WORD COLLECTION' },
        { id: 'header-validation', name: 'Header + Reserved Validation', description: 'Check opcode/subtype, required word count and reserved fields before any Context is exposed.', boundary: 'DECODE_PENDING · FAULT CHECK' },
        { id: 'context-decode', name: 'Schedule + Instruction Decode', description: 'Extract base/wait cycle, inner/outer loop fields and the FU-specific base instruction.', boundary: 'COMBINATIONAL FIELD DECODE' },
        { id: 'context-output', name: 'Registered Context Output', description: `Hold the complete ${output} stable until the Context FIFO accepts it.`, boundary: '1-ENTRY HOLD · BACKPRESSURE SAFE' },
      ],
    }
  }
  const schedulerPipeline = (variant, item, stageIndex) => {
    const contextStage = variant.stages[stageIndex - 1]
    const queueStage = variant.stages[stageIndex + 1]
    const contextWidth = contextStage ? specValue(contextStage, 'Entry width', 'Context') : 'Context'
    const activeContexts = specValue(item, 'Active contexts', '1')
    const outputInstruction = specValue(item, 'Output instruction', 'Base instruction')
    const queueName = queueStage?.name ?? 'FU-local Instruction Queue'
    const directContextAdmission = item.id === 'mem-scheduler'
    const hasOuterSpatialTransition = ['mem-scheduler', 'load-scheduler', 'compute-scheduler'].includes(item.id)
    const outerTransitionNote = hasOuterSpatialTransition
      ? 'outer_cycle_transition advances from the previous row final issue to the next row first issue; outer_spatial_transition applies the matching address or operand transition.'
      : 'outer_cycle_transition advances from the previous row final issue to the next row first issue.'
    return {
      kind: 'scheduler',
      title: `${item.name} · Context Expansion Pipeline`,
      summary: directContextAdmission
        ? `The MEM Scheduler validates and converts the Context FIFO head, admits it directly into an originally free Active Context slot, then selects work ahead of the absolute issue cycle and emits one MEM base instruction into the paired Instruction Queue. ${outerTransitionNote}`
        : `The Scheduler captures and admits a decoded Context through distinct ownership boundaries, retains its loop/timing state, selects work ahead of the absolute issue cycle and emits one FU base instruction into the paired Instruction Queue. ${outerTransitionNote}`,
      inputLabel: `${contextWidth} Context · ready/valid from Context FIFO`,
      outputLabel: `${outputInstruction} instruction + 32-bit issue cycle → ${queueName}`,
      timingNote: directContextAdmission
        ? `Registered ownership boundaries are the upstream Context FIFO, Active Context state and the FU-local Instruction Queue. The MEM Scheduler has no second ingress register: context_admit_fire is the direct Context FIFO handshake into an originally free Active Context slot. Active Context advances only on schedule_select_fire, when the Instruction Queue accepts the generated instruction. ${outerTransitionNote}`
        : `Registered ownership boundaries are Context ingress, Active Context state and the FU-local Instruction Queue. context_capture_fire captures Context FIFO data; context_admit_fire moves the ingress record into a slot that was already free before the current edge. Active Context advances only on schedule_select_fire, when the queue accepts the generated instruction. ${outerTransitionNote}`,
      steps: directContextAdmission ? [
        { id: 'context-fifo-head', name: 'Context FIFO Head', description: 'Observe the current Context FIFO output fields directly; the FIFO retains the head while context_ready_o is low.', boundary: 'UPSTREAM FIFO STORAGE · READY / VALID' },
        { id: 'validate-convert', name: 'Validation + Conversion', description: 'Check target, native instruction, loop counts, intervals, strides, address range and absolute deadline while deriving the Active Context schedule state directly from context_*_i.', boundary: 'COMBINATIONAL · FAULT ARBITRATION' },
        { id: 'direct-admit', name: 'Direct Active Context Admission', description: 'context_admit_fire writes the validated and converted Context directly into the first originally free Active Context slot.', boundary: 'context_admit_fire · FREE SLOT' },
        { id: 'active-context', name: 'Active Context State', description: `Store up to ${activeContexts} active Context${activeContexts === '1' ? '' : 's'} with remaining loop counts, next issue cycle and normalized outer transition state.`, boundary: hasOuterSpatialTransition ? 'outer_cycle_transition · outer_spatial_transition' : 'outer_cycle_transition' },
        { id: 'lookahead-select', name: 'Lookahead Due Select', description: 'Compare next-issue cycles against schedule_cycle + 2 and detect conflicts, missed generation or overflow.', boundary: 'ISSUE_LOOKAHEAD = 2' },
        { id: 'instruction-generate', name: 'Base Instruction Generate', description: `Apply the current induced address and form the ${outputInstruction} MEM instruction.`, boundary: 'INSTRUCTION + ABSOLUTE CYCLE' },
        { id: 'queue-handoff', name: 'Instruction Queue Handoff', description: `schedule_select_fire transfers the timed instruction to ${queueName}; only this accepted handshake advances or retires the Context.`, boundary: 'schedule_select_fire · ISSUE VALID / READY' },
      ] : [
        { id: 'context-ingress', name: 'Context Ingress Register', description: 'context_capture_fire captures one Context through ready/valid without exposing Active Context storage latency upstream.', boundary: 'context_capture_fire · BACKPRESSURE SAFE' },
        { id: 'validate-admit', name: 'Validate + Admit', description: 'context_admit_fire checks target, instruction, loop counts, transitions and deadline lead time, then writes only a slot that was already free before the current edge.', boundary: 'context_admit_fire · PRE-EDGE FREE SLOT' },
        { id: 'active-context', name: 'Active Context State', description: `Store up to ${activeContexts} active Context${activeContexts === '1' ? '' : 's'} with remaining loop counts, next issue cycle and normalized outer transition state.`, boundary: hasOuterSpatialTransition ? 'outer_cycle_transition · outer_spatial_transition' : 'outer_cycle_transition' },
        { id: 'lookahead-select', name: 'Lookahead Due Select', description: 'Compare next-issue cycles against schedule_cycle + 2 and detect conflicts, missed generation or overflow.', boundary: 'ISSUE_LOOKAHEAD = 2' },
        { id: 'instruction-generate', name: 'Base Instruction Generate', description: `Apply the current induced operand/address and form the ${outputInstruction} FU instruction.`, boundary: 'INSTRUCTION + ABSOLUTE CYCLE' },
        { id: 'queue-handoff', name: 'Instruction Queue Handoff', description: `schedule_select_fire transfers the timed instruction to ${queueName}; only this accepted handshake advances or retires the Context.`, boundary: 'schedule_select_fire · ISSUE VALID / READY' },
      ],
    }
  }

  for (const frontend of frontends) for (const variant of frontend.variants) for (const [stageIndex, item] of variant.stages.entries()) {
    item.specs = frontendStageSpecs.get(item.id) ?? []
    if (item.id.endsWith('-decoder')) item.pipeline = decoderPipeline(frontend, variant, item)
    if (item.id.endsWith('-scheduler')) item.pipeline = schedulerPipeline(variant, item, stageIndex)
  }

  const programLoad = {
    controlDomain: {
      widthBits: 1,
      values: ['WRITE', 'PRIME'],
      relationship: 'Separate encoding domain from FU instruction opcodes',
      status: 'rtl-confirmed',
      evidence: [source('rtl/program_load/lpu_program_load_pkg.sv', 62, 'lpu_program_load_control_e', 'PROGRAM_LOAD_CONTROL_WIDTH=1; WRITE=0 / PRIME=1')],
    },
    wordTransport: {
      dataBits: 128,
      strobeBits: 4,
      bitsPerStrobe: 32,
      addressBits: 17,
      scopeBits: 2,
      destinationBits: 12,
      sequenceIdPresent: false,
      status: 'rtl-confirmed',
      evidence: [
        source('rtl/program_load/lpu_program_load_pkg.sv', 11, 'PROGRAM_WORD_STRB_WIDTH', '4 strobes × 32-bit segments'),
        source('rtl/program_load/lpu_program_word_fifo.sv', 11, 'enqueue_scope_i / enqueue_destination_i', '2-bit Scope + 12-bit Destination travel with every Program Word; no Sequence ID field'),
      ],
    },
    routing: {
      scope: {
        widthBits: 2,
        values: [
          { name: 'EAST', encoding: 0, meaning: 'Send to the concrete East endpoint.' },
          { name: 'WEST', encoding: 1, meaning: 'Send to the concrete West endpoint.' },
          { name: 'BOTH', encoding: 2, meaning: 'Distributor expands one record into independent East and West handshakes.' },
        ],
        relationship: 'Scope controls fanout. It is not part of the 12-bit Destination and is not an FU instruction field.',
        status: 'rtl-confirmed',
        evidence: [source('rtl/program_load/lpu_program_load_pkg.sv', 30, 'lpu_program_hemisphere_scope_e', 'PROGRAM_SCOPE_EAST=0, WEST=1, BOTH=2')],
      },
      destination: {
        widthBits: 12,
        fields: [
          { name: 'Hemisphere', bits: '11', widthBits: 1, meaning: 'Concrete endpoint: East=0, West=1.' },
          { name: 'Target Kind', bits: '10:8', widthBits: 3, meaning: 'MEM, three MXM classes, VXM, SXM Transpose/Permute, or Reserved.' },
          { name: 'Local Target Index', bits: '7:0', widthBits: 8, meaning: 'Index is local to the selected Hemisphere and Kind.' },
        ],
        relationship: 'Destination names exactly one physical target: {hemisphere[11], kind[10:8], local_target_index[7:0]}.',
        status: 'rtl-confirmed',
        evidence: [source('rtl/program_load/lpu_program_load_pkg.sv', 47, 'PROGRAM_DESTINATION_*', '12-bit Destination field boundaries and program_destination_pack()')],
      },
      kinds: [
        { name: 'MEM', encoding: 0, status: 'rtl-confirmed' },
        { name: 'MXM_LOAD', encoding: 1, status: 'rtl-confirmed' },
        { name: 'MXM_DEQUANT', encoding: 2, status: 'rtl-confirmed' },
        { name: 'MXM_COMPUTE', encoding: 3, status: 'rtl-confirmed' },
        { name: 'VXM', encoding: 4, status: vxmBoundaryConnected ? 'partially-verified' : 'needs-review' },
        { name: 'SXM_TRANSPOSE', encoding: 5, status: sxmBoundaryConnected ? 'partially-verified' : 'needs-review' },
        { name: 'SXM_PERMUTE', encoding: 6, status: sxmBoundaryConnected ? 'partially-verified' : 'needs-review' },
        { name: 'RESERVED', encoding: 7, status: 'needs-review' },
      ],
      mappings: [
        { name: 'MEM', localIndex: '0..103 / Hemisphere', status: 'rtl-confirmed', statement: '52 Slices × 2 Banks; no global Queue ID translation remains in the FU Cluster.' },
        { name: 'MXM Load / Dequant / Compute', localIndex: '0..1 / Kind / Hemisphere', status: 'rtl-confirmed', statement: 'Each MXM Kind selects one of two local MXM instances.' },
        { name: 'VXM', localIndex: 'Central direct → Subsystem Boundary', status: vxmBoundaryConnected ? 'partially-verified' : 'needs-review', statement: 'The VXM request bypasses both Relay chains and reaches the real lpu_vxm_subsystem Program Boundary. Ready=0 and no Commit because the local-iMEM / Fetch Adapter is absent.' },
        { name: 'SXM Transpose / Permute', localIndex: 'R0–R6 → R6 Outer Local → Subsystem Boundary', status: sxmBoundaryConnected ? 'partially-verified' : 'needs-review', statement: 'Transpose and Permute records traverse the seven-stage Hemisphere Relay chain and reach the real lpu_sxm_subsystem Program Boundary. Ready=0 and no Commit because the local-iMEM / Fetch Adapter is absent.' },
      ],
      controlSystemBoundary: {
        status: 'needs-review',
        statement: 'The Program Command Sequencer carries independent 2-bit Scope, but the current lpu_top / lpu_program_load_controller command-write boundary exposes only Destination and derives EAST or WEST Scope from Destination[11]. A top-level BOTH command input is not exposed in the inspected RTL.',
        evidence: [source('rtl/program_load/lpu_program_load_controller.sv', 248, 'command_scope_w', 'Scope is derived from command_write_destination_i[11] at the Controller boundary', 'needs-review')],
      },
    },
    relay: {
      recordWidthBits: 165,
      bufferDepth: relayBufferDepth.value ?? 2,
      groupsPerHemisphere: memGroups.value,
      slicesPerGroup: columnsPerGroup.value,
      banksPerSlice: banksPerColumn.value,
      groupsPerRelay: relayGroupsPerStage.value,
      relayCountPerHemisphere,
      totalRelayStages: relayTotalStages,
      stages: relayStages,
      implementationStatus: '2 × 7 RTL Instances',
      verificationStatus: 'System Program-to-FU VCS PASS',
      integrationStatus: 'Integrated',
      vxmBypass: 'Central VXM Direct delivers the complete Program Record to the real lpu_vxm_subsystem Program Boundary and bypasses both Relay chains. Boundary Connected; Ready=0 and No Commit because the local-iMEM / Fetch Adapter is not integrated.',
      peripheralForward: 'R6 Outer Local preserves the complete 12-bit Destination. MXM Load / Dequant / Compute are integrated. SXM Transpose / Permute traverse R0–R6 and reach lpu_sxm_subsystem; Boundary Connected, Ready=0, No Commit, Endpoint Not Integrated.',
      localProgramPortsPerHemisphere: relayCountPerHemisphere,
      totalLocalProgramPorts: relayTotalStages,
      clusterAdapter: 'Program Distribution is a direct lpu_top child. It exports 7 independent MEM Local Program Ports per Hemisphere across the top-level boundary; the FU Cluster only consumes these ports and owns QCTL, Schedule Cycle and FU-local Frontends/Subsystems.',
      timing: {
        storageMeaning: 'The internal two-entry buffer is one registered Relay boundary plus skid capacity, not two independent pipeline stages.',
        readyBoundary: 'input_ready_o depends on registered occupancy and route validity, not combinationally on downstream forward_ready_i.',
        throughput: 'Steady-state simultaneous dequeue/enqueue targets II=1; Ready may recover one cycle after a full buffer drains.',
      },
      verification: {
        result: 'PROGRAM LOAD SYSTEM → PROGRAM DISTRIBUTION SYSTEM → FU SUBSYSTEM CLUSTER · VCS PASS',
        checks: 77,
        networkChecks: 77,
        topChecks: 340,
        physicalEdges: 569,
        singleStageChecks: 0,
        fixedDefect: 'The current Distribution System keeps two independent seven-stage Relay chains and exposes all 14 Relay-local MEM Program handshakes without a per-Hemisphere 7-to-1 adapter.',
      },
      evidence: [
        source(relayChainDefinition?.file ?? 'rtl/program_load/lpu_program_distribute_relay_chain.sv', relayChainDefinition?.line ?? 1, 'gen_relay[*].u_relay', 'seven serial Relay stages per Hemisphere; R0–R5 cover 16 MEM Banks and R6 covers 8 Banks plus Outer Local', relayStagesGenerated ? 'rtl-confirmed' : 'needs-review'),
        source('rtl/lpu_top.sv', 215, 'u_program_distribute_system', 'Program Distribution is a direct lpu_top child and exports the FU-local Program buses', networkIntegrated ? 'rtl-confirmed' : 'needs-review'),
        source('rtl/program_load/lpu_program_distribute_system.sv', 248, 'gen_program_relay_chain[0:1]', 'Two integrated seven-stage Relay chains expose fourteen Local Program ports', relayChainIntegrated ? 'rtl-confirmed' : 'needs-review'),
        source('handoff/latest-rtl-change.md', 1, 'Program Distribution top-level handoff', 'Both current system regressions passed after the top-level ownership refactor', 'rtl-confirmed'),
      ],
    },
    endpointBoundaries: [
      {
        id: 'sxm',
        name: 'SXM Transpose / Permute',
        route: 'Hemisphere Distributor → R0–R6 → R6 Outer Local',
        boundary: 'lpu_sxm_subsystem Program Boundary',
        boundaryStatus: sxmBoundaryConnected ? 'Boundary Connected' : 'Boundary Needs Review',
        endpointStatus: 'Endpoint Not Integrated',
        ready: 'Ready=0',
        commit: 'No Commit',
        missingAdapter: 'local-iMEM / Fetch Adapter',
        frontendStatus: 'Standalone Macro Frontend · TB PASS',
        status: sxmBoundaryConnected ? 'partially-verified' : 'needs-review',
        evidence: [
          source('rtl/program_load/lpu_program_distribute_system.sv', 1, 'sxm_program_valid / ready', 'R6 Outer Local reaches the SXM Program boundary while preserving the Forward Chain', sxmBoundaryConnected ? 'rtl-confirmed' : 'needs-review'),
          source('rtl/sxm/lpu_sxm_subsystem.sv', 32, 'program_ready_o', "program_ready_o=1'b0; local-iMEM transport is not implemented", 'rtl-confirmed'),
          source('handoff/latest-rtl-change.md', 1, 'lpu_program_load_fu_boundary_tb', 'PASS checks=37; SXM Transpose/Permute traverse R0-R6 and remain stable under backpressure', 'rtl-confirmed'),
        ],
      },
      {
        id: 'vxm',
        name: 'VXM',
        route: 'Global Distributor → Central Direct · Relay Bypass',
        boundary: 'lpu_vxm_subsystem Program Boundary',
        boundaryStatus: vxmBoundaryConnected ? 'Boundary Connected' : 'Boundary Needs Review',
        endpointStatus: 'Endpoint Not Integrated',
        ready: 'Ready=0',
        commit: 'No Commit',
        missingAdapter: 'local-iMEM / Fetch Adapter',
        frontendStatus: 'Standalone Macro Frontend · TB PASS',
        status: vxmBoundaryConnected ? 'partially-verified' : 'needs-review',
        evidence: [
          source('rtl/program_load/lpu_program_distribute_system.sv', 1, 'vxm_program_valid / ready', 'Central VXM direct Program route bypasses both Relay chains', vxmBoundaryConnected ? 'rtl-confirmed' : 'needs-review'),
          source('rtl/vxm/lpu_vxm_subsystem.sv', 30, 'program_ready_o', "program_ready_o=1'b0; resident-config/Execute adapter is not implemented", 'rtl-confirmed'),
          source('handoff/latest-rtl-change.md', 1, 'lpu_program_load_fu_boundary_tb', 'PASS checks=37; VXM reaches the central Subsystem while both Relay inputs remain free of VXM requests', 'rtl-confirmed'),
        ],
      },
    ],
    resetLifecycle: {
      trigger: 'program_reset_i',
      transportReset: 'program_transport_rst_ni = rst_ni && !program_reset_i',
      effects: ['Clear 14 Relay Record Buffers', 'Clear per-port local handshake state', 'Reset outstanding Commit state'],
      status: 'rtl-confirmed',
      evidence: [
        source('rtl/program_load/lpu_program_distribute_system.sv', 1, 'program_transport_rst_ni', 'Program Reset participates in the active-low Relay transport reset', 'rtl-confirmed'),
        source('rtl/program_load/lpu_program_distribute_system.sv', 255, 'gen_program_relay_chain', 'Both seven-stage Relay chains consume program_transport_rst_ni', 'rtl-confirmed'),
        source('handoff/latest-rtl-change.md', 1, 'Program Reset boundary regression', 'stalled R6 record is cleared and does not leak into the next Program', 'rtl-confirmed'),
      ],
    },
    destinations: [
      {
        id: 'mem', name: 'MEM local iMEM', acceptedStrobe: '0111', validPayloadBits: 96,
        behavior: 'Invalid strobe/address raises load fault and inhibits the iMEM write.', status: 'rtl-confirmed',
        evidence: [source('rtl/mem/lpu_mem_local_imem_frontend.sv', 108, 'load_record_illegal_w', "load_strb_i == 4'b0111; illegal load record is gated from u_imem")],
      },
      {
        id: 'mxm-load', name: 'MXM Load local iMEM', acceptedStrobe: '1111', validPayloadBits: 128,
        behavior: 'Kind=1, Local Index 0..1 per Hemisphere. Invalid strobe/address/index raises a load or route fault.', status: 'rtl-confirmed',
        evidence: [source('rtl/core/lpu_fu_subsystem_cluster.sv', 296, 'PROGRAM_TARGET_MXM_LOAD', 'Destination Kind and local index select one of two local MXM instances')],
      },
      {
        id: 'mxm-dequant', name: 'MXM Dequant local iMEM', acceptedStrobe: '1111', validPayloadBits: 128,
        behavior: 'Kind=2, Local Index 0..1 per Hemisphere. Invalid strobe/address/index raises a load or route fault.', status: 'rtl-confirmed',
        evidence: [source('rtl/core/lpu_fu_subsystem_cluster.sv', 296, 'PROGRAM_TARGET_MXM_DEQUANT', 'Destination Kind and local index select one of two local MXM instances')],
      },
      {
        id: 'mxm-compute', name: 'MXM Compute local iMEM', acceptedStrobe: '1111', validPayloadBits: 128,
        behavior: 'Invalid strobe/address raises load fault and inhibits the iMEM write.', status: 'rtl-confirmed',
        evidence: [source('rtl/core/lpu_fu_subsystem_cluster.sv', 296, 'PROGRAM_TARGET_MXM_COMPUTE', 'Kind=3 and Local Index 0..1 select one of two local MXM instances')],
      },
      {
        id: 'sxm-boundary', name: 'SXM Program Boundary', acceptedStrobe: 'BOUNDARY ONLY', validPayloadBits: 128,
        behavior: 'Transpose / Permute reaches lpu_sxm_subsystem through R0–R6. Ready=0 and No Commit until a local-iMEM / Fetch Adapter is integrated.', status: 'partially-verified',
        evidence: [source('rtl/sxm/lpu_sxm_subsystem.sv', 5, 'Program Load boundary', 'Complete Program Record ports exist; local-iMEM transport is not implemented', 'rtl-confirmed')],
      },
      {
        id: 'vxm-boundary', name: 'VXM Program Boundary', acceptedStrobe: 'BOUNDARY ONLY', validPayloadBits: 128,
        behavior: 'Central Direct reaches lpu_vxm_subsystem without entering either Relay chain. Ready=0 and No Commit until a local-iMEM / Fetch Adapter is integrated.', status: 'partially-verified',
        evidence: [source('rtl/vxm/lpu_vxm_subsystem.sv', 5, 'Program Load boundary', 'Complete Program Record ports exist; resident-config/Execute adapter is not implemented', 'rtl-confirmed')],
      },
    ],
    commit: {
      signals: ['valid', 'ready', 'error'],
      ordering: 'Independent per-endpoint 1-bit token FIFO pairs WRITE responses in issue order; BOTH is retired only after both branch handshakes complete',
      sequenceIdPresent: false,
      status: 'rtl-confirmed',
      evidence: [
        source('rtl/program_load/lpu_program_load_controller.sv', 535, 'u_west_commit_fifo', 'DATA_WIDTH=1 ordered token FIFO'),
        source('rtl/program_load/lpu_program_load_controller.sv', 550, 'u_east_commit_fifo', 'DATA_WIDTH=1 ordered token FIFO'),
        source('rtl/program_load/lpu_program_load_controller.sv', 564, 'west/east_commit_valid/ready/error', 'ordered commit handshake and fault check'),
      ],
    },
    excludedPaths: [{
      name: 'Direct Host → MEM SRAM access / bypass', status: 'rtl-confirmed',
      statement: 'Not present as a current primary architecture interface.',
      evidence: [source('rtl/program_load/lpu_program_distribute_system.sv', 248, 'gen_program_relay_chain', 'Top-level Program Distribution routes through integrated endpoint decode, Relay chains and fourteen independent Local Program Ports')],
    }],
    reviewItems: [
      { name: 'Top-level BOTH Scope exposure', status: 'needs-review', statement: 'Distribution Ingress BOTH expansion is RTL-confirmed, but lpu_program_load_controller currently derives only EAST or WEST Scope from Destination[11].' },
      { name: 'MXM 49/48-bit issue width', status: 'needs-review', statement: 'Current frontend/queue path still contains a width discrepancy; do not present it as resolved.' },
      { name: 'VXM Program endpoint', status: 'needs-review', statement: 'Boundary Connected through Central Direct and explicitly bypasses Relay. Endpoint Not Integrated: Ready=0, No Commit, missing local-iMEM / Fetch Adapter.' },
      { name: 'SXM Program endpoint', status: 'needs-review', statement: 'Boundary Connected after real R0–R6 traversal. Endpoint Not Integrated: Ready=0, No Commit, missing local-iMEM / Fetch Adapter.' },
    ],
    validation: {
      status: 'QCTL REWORK · SCOPED RTL / INTEGRATION PASS',
      scope: 'The current handoff records QCTL Controller, Shared Pool, complete QCTL System, MEM-local Scheduler integration, top-level macro-frontend Cluster simulation, and full lpu_top compile/elaboration/link validation.',
      limitation: 'These PASS results are scoped to the named QCTL modules and integration tests. They are not a complete DMA system-level execution PASS. The independent CMODEL QCTL runtime has not replaced the old formal main chain, and subsystem.program.loader still has the existing program-load-did-not-finish issue.',
      results: [
        'lpu_qctl_controller_tb · VCS PASS · four waits + TAG match/mismatch + CE stop/restart',
        'lpu_qctl_shared_pool_tb · VCS PASS · partition/address mapping + single-port arbitration + multi-Queue requests',
        'lpu_qctl_system_tb · VCS PASS · 3-participant Barrier + early NOTIFY + two rounds + early Event + MEM_PACKET hold/reset',
        'lpu_mem_subsystem_native_tb · VCS PASS · independent Bank-local QCTL stop/run + Native dual-Bank issue',
        'lpu_top_macro_frontend_cluster_tb · VCS PASS · checks=77',
        'lpu_top · VCS compile + elaboration + link PASS',
      ],
      evidence: [source('handoff/latest-rtl-change.md', 77, 'QCTL Pool / Cache / Controller Refactor', 'named QCTL module and integration VCS PASS results; full DMA system-level PASS not claimed', 'rtl-confirmed')],
    },
  }

  return {
    schemaVersion: 12,
    generatedAt: snapshot.generatedAt,
    source: {
      snapshotGeneratedAt: snapshot.generatedAt,
      projectRoot: snapshot.project?.projectRoot ?? null,
      selectedTop: snapshot.summary?.selectedTop ?? null,
      rtlFileCount: snapshot.summary?.sourceFileCount ?? null,
      packageSha256: snapshot.sourceFiles?.find((item) => item.file === 'rtl/core/lpu_pkg.sv')?.sha256 ?? null,
    },
    policy: {
      statement: 'Configuration is generated from the current RTL snapshot, module parameters, package constants, generate formulas, and physical architecture evidence.',
      warning: 'WIP RTL SNAPSHOT: optional or disabled generate paths are shown separately from active default configuration.',
    },
    summary,
    programLoad,
    qctl: {
      laneCount: qctlQueueCount.value,
      enabledByDefault: qctl.value === 1,
      status: 'rtl-confirmed',
      groups: [
        { id: 'mem', name: 'MEM Bank-local Controllers', first: 0, last: 207, count: 208, status: 'rtl-confirmed', statement: 'Two hemispheres × 104 bank-local queues.' },
        { id: 'mxm-load', name: 'MXM Load', first: 208, last: 211, count: 4, status: 'rtl-confirmed', statement: 'One Load lane per MXM.' },
        { id: 'mxm-dequant', name: 'MXM Dequant', first: 212, last: 215, count: 4, status: 'rtl-confirmed', statement: 'One Dequant lane per MXM.' },
        { id: 'mxm-compute', name: 'MXM Compute', first: 216, last: 219, count: 4, status: 'rtl-confirmed', statement: 'One Compute lane per MXM.' },
      ],
      pipeline: [
        { id: 'pool', name: 'Shared QCTL Pool', count: 1, statement: 'Owns Partition Base / Count / Generation, physical address mapping and one read-port arbitration.', evidence: [source('rtl/icu/lpu_qctl_system.sv', 141, 'u_shared_pool', 'single shared lpu_qctl_shared_pool')] },
        { id: 'cache', name: 'Per-Queue Cache', count: qctlQueueCount.value, statement: `Each formal endpoint owns a ${qctlCacheDepth.value ?? 'parameterized'}-entry Cache with Fetch Offset, Retire Offset, in-flight read count and Head Record.`, evidence: [source('rtl/icu/lpu_qctl_system.sv', 187, 'gen_queue_endpoint[*].u_queue_cache', 'one lpu_qctl_queue_cache per formal Queue'), qctlCacheDepth.evidence] },
        { id: 'controller', name: 'Per-Queue Five-State Controller', count: qctlQueueCount.value, statement: 'Semantic Controller owns only IDLE and the four blocking waits; Pool/Cache state and Scheduler Cycle remain outside it.', evidence: [source('rtl/icu/lpu_qctl_system.sv', 215, 'gen_queue_endpoint[*].u_controller', 'one lpu_qctl_controller per formal Queue'), source('rtl/icu/lpu_qctl_controller.sv', 34, 'state_t', 'IDLE + four wait states')] },
        { id: 'ce', name: 'scheduler_counter_ce', count: qctlQueueCount.value, statement: 'The blocking Record lowers CE in the same cycle; QCTL does not create a local clock or recalculate the Scheduler Cycle.', evidence: [source('rtl/icu/lpu_qctl_controller.sv', 182, 'scheduler_counter_ce_o', 'run/configured/primed and state-dependent CE')] },
        { id: 'counter', name: 'FU-local Scheduler Cycle Counter', count: qctlQueueCount.value, statement: '208 MEM counters and 12 MXM stream counters live in their owning FU Subsystems.', evidence: [source('rtl/mem/lpu_mem_subsystem.sv', 167, 'qctl_scheduler_cycle_q', 'one Bank-local 32-bit Counter per MEM Queue'), source('rtl/mxm/lpu_mxm_subsystem.sv', 131, 'qctl_scheduler_cycle_q', 'three Stream-local 32-bit Counters per MXM')] },
      ],
      states: [
        { id: 'idle', name: 'IDLE', statement: 'Reads the current Head Record and keeps CE high only for nonblocking or already-completed work.' },
        { id: 'sync', name: 'SYNC_WAIT', statement: 'Holds the Queue until the Participant-Mask Barrier broadcasts Release.' },
        { id: 'event', name: 'EVENT_WAIT', statement: 'Holds the Queue until the 32-bit TAG Event broadcast matches the saved operand.' },
        { id: 'notify', name: 'NOTIFY_WAIT', statement: 'Keeps an early NOTIFY request asserted; retirement waits for the current round to release.' },
        { id: 'packet', name: 'MEMPACKET_WAIT', statement: 'Keeps the packet ordinal stable until external mem_packet_retired_i.' },
      ],
      barrier: {
        participantMask: 'Only Queue IDs selected by participant_mask_i participate in the current barrier round.',
        arrival: 'Arrival is an idempotent per-round bit mask, not a token counter.',
        notify: 'An early NOTIFY remains pending and cannot retire before every configured participant arrives.',
        release: 'A successful NOTIFY emits one-cycle Release directly to all participants.',
        roundIsolation: 'Arrival state is cleared on Release and held clear across the Release edge, so consecutive rounds do not leak history.',
      },
      eventBuffer: {
        tagBits: 32,
        depth: qctlEventDepth.value,
        statement: 'The independent Event Buffer retains early DMA completion TAGs outside every Controller; one matching TAG broadcast may release every waiting Controller with that TAG.',
      },
      memPacket: {
        ordinalBits: 32,
        retirement: 'MEM_PACKET ordinal remains stable while waiting and retires only through external mem_packet_retired_i.',
        sramCommitRelationship: 'Packet retirement is not SRAM Commit. QCTL consumes only the final data-completion event; generation of the final SRAM Commit event remains in DMA / data movement.',
      },
      endpointBoundary: {
        connected: ['MEM · 208 Bank Queues', 'MXM · 12 Load / Dequant / Compute Queues'],
        notConnected: ['VXM · no formal QCTL Queue number', 'SXM · no formal QCTL Queue number'],
        statement: 'lpu_qctl_system generates one Cache + Controller per formal Queue and the Cluster directly wires CE / Scheduler Cycle only to MEM and MXM local Schedulers. Do not draw QCTL as migrated into VXM or SXM.',
      },
      validation: {
        status: 'SCOPED VCS PASS',
        scope: 'Controller, Shared Pool, QCTL System, MEM Scheduler integration, top macro-frontend Cluster, and lpu_top compile/elaboration/link passed the handoff validation.',
        limitation: 'This is not a complete DMA system-level PASS. Event production at the final SRAM Commit remains owned by DMA/data movement, and CMODEL formal main-chain replacement remains open.',
        results: programLoad.validation.results,
      },
      evidence: [qctl.evidence, qctlQueueCount.evidence, source('rtl/core/lpu_fu_subsystem_cluster.sv', 167, 'gen_qctl.u_qctl_system', 'MEM=0..207, MXM Load=208..211, Dequant=212..215, Compute=216..219; VXM/SXM excluded', 'rtl-confirmed')],
    },
    memIsa: {
      machineCodeBits: memInstructionWidth.value,
      nativeCommandBits: nativeCommandWidth.value,
      queueEntryBits,
      addressBits: memAddressWidth.value,
      status: 'rtl-confirmed',
      notes: [
        { name: 'READ / WRITE', status: 'rtl-confirmed', statement: 'Implemented MEM64 opcodes; the Native branch adapts them to a private Native32 command.' },
        { name: 'GATHER / SCATTER', status: 'rtl-confirmed', statement: 'Architecturally legal in the MEM64 decoder but currently unsupported; the adapter raises unsupported/fault instead of issuing.' },
        { name: 'Opcode 2', status: 'rtl-confirmed', statement: 'Retired/illegal encoding; the decoder rejects it.' },
      ],
      evidence: [memInstructionWidth.evidence, nativeCommandWidth.evidence, memAddressWidth.evidence, source('rtl/core/lpu_isa_decode.sv', 1, 'decode_mem_instruction', 'READ/WRITE implemented; GATHER/SCATTER legal unsupported; opcode2 illegal')],
    },
    frontends,
    compositions,
    memArray: {
      memCount,
      groupsPerMem: memGroups.value,
      columnsPerGroup: columnsPerGroup.value,
      columnsPerMem,
      banksPerColumn: banksPerColumn.value,
      banksPerMem,
      tileSlicesPerBank: tileRows.value,
      logicalTileSlicesPerMem: slicesPerMem,
      logicalTileSlicesSystem: multiply(slicesPerMem, memCount),
      wordWidthBits,
      depthRows: depthRows.value,
      macroWidthBits,
      macroDepthRows,
      widthBanks,
      depthBanks,
      mappedMacrosPerSlice: null,
      mappedMacrosPerMem: null,
      mappedMacrosSystem: null,
      activePhysicalMacros: 0,
      macroSelectEnabled,
      macroDefineEnabled,
      implementationStatus: useNativeMem.value === 1 ? 'Native Default' : 'Legacy Compatibility',
      formula: `${memGroups.value ?? 'GROUPS'} × ${columnsPerGroup.value ?? 'SLICES_PER_GROUP'} × ${banksPerColumn.value ?? 'BANKS_PER_SLICE'} × ${leafSramsPerBank ?? 'SUPERLANES'}`,
      evidence: [useNativeMem.evidence, memGroups.evidence, columnsPerGroup.evidence, banksPerColumn.evidence, depthRows.evidence, source('rtl/mem_native/mem_bank_superlane_leaf.sv', 1, 'mem_bank_superlane_leaf', 'behavioral DEPTH × 64-bit leaf array')],
      samplePath: 'u_fu_subsystems.gen_hemisphere[0].u_mem_subsystem.gen_native_mem.u_native_command_integration.u_srf_integration.u_mem_hemisphere.group_gen[*].u_group.slice_gen[*].u_slice.bank[*].superlane[*].u_leaf',
      activeImplementation: useNativeMem.value === 1 ? 'native' : useNativeMem.value === 0 ? 'legacy' : 'needs-review',
      nativeEnabledByDefault: useNativeMem.value === 1,
      machineCodeBits: memInstructionWidth.value,
      nativeCommandBits: nativeCommandWidth.value,
      queueEntryBits,
      leafSramsPerBank,
      leafSramsPerMem,
      leafSramsSystem,
      streamRegisterColumns: activeStreamColumns.value,
      streamRegisterPackageColumns: packageStreamColumns.value,
      streamRegisterMemBoundaries: memMappedStreamBoundaries,
      streamRegisterStatus,
      streamRegisterNote: streamColumnCountConflict
        ? `Active SRF COLUMNS=${activeStreamColumns.value}; lpu_pkg STREAM_REGISTER_COLUMNS=${packageStreamColumns.value}. The extra active column is displayed and marked Needs Review rather than hidden.`
        : 'Active SRF column count matches the package-level architectural count.',
      streamRegisterEvidence: [activeStreamColumns.evidence, packageStreamColumns.evidence, streamRegisterMappingEvidence],
      leafWidthBits: wordWidthBits,
      leafDepthRows: depthRows.value,
      leafImplementation: 'Behavioral 8192 × 64 bank/superlane array in the current Native default branch; not a claimed physical SRAM macro.',
    },
  }
}
