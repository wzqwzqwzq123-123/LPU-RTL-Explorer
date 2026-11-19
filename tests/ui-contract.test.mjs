import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFile(path.join(root, file), 'utf8')

test('drill navigation is parent-aware and browser-history backed', async () => {
  const [app, detail] = await Promise.all([read('src/App.tsx'), read('src/components/FunctionalBlockDetail.tsx')])
  assert.match(app, /addEventListener\('popstate'/)
  assert.match(app, /navigateDrillParent/)
  assert.match(app, /window\.history\.back\(\)/)
  assert.match(detail, /current\.parentId \? `返回/)
  assert.doesNotMatch(detail, />← L1<\/button>/)
})

test('hardware specifications are hoverable, keyboard reachable and do not force storage drill pages', async () => {
  const [graph, detail, styles] = await Promise.all([read('src/components/FunctionalConnectivityGraph.tsx'), read('src/components/FunctionalBlockDetail.tsx'), read('src/styles.css')])
  assert.match(graph, /tabIndex=\{0\}/)
  assert.match(graph, /hardware-spec-tooltip/)
  assert.match(detail, /node\.childIds\.length && !isStorageNode\(node\) \? navigate/)
  assert.match(styles, /:focus-visible \.hardware-spec-tooltip/)
  assert.match(detail, /node\.id\.startsWith\('arch:control:qctl'\) && node\.childIds\.length/)
})

test('all shared graph edge renderers retain directed arrow markers', async () => {
  const [functional, physical, hierarchy] = await Promise.all([read('src/components/FunctionalConnectivityGraph.tsx'), read('src/components/PhysicalArchitectureGraph.tsx'), read('src/components/ArchitectureGraph.tsx')])
  for (const source of [functional, physical, hierarchy]) {
    assert.match(source, /markerEnd=\{markerEnd\}/)
    assert.match(source, /MarkerType\.ArrowClosed/)
  }
})

test('global Program Load keeps controller and relay architecture above FU-local frontend entry points', async () => {
  const [source, app, model, readme] = await Promise.all([read('src/components/PhysicalArchitectureGraph.tsx'), read('src/App.tsx'), read('server/architecture-drilldown-model.mjs'), read('README.md')])
  const y = (id) => Number(source.match(new RegExp(`'${id.replaceAll(':', '\\:')}'[^\\n]+y: (\\d+)`))?.[1])
  assert.ok(y('arch:control:program-load:instruction-dma') < y('arch:control:program-load:elastic'))
  assert.equal(y('arch:control:program-load:elastic'), y('arch:control:program-load:fu-entry'))
  for (const layer of ['L1 · PROGRAM LOAD SYSTEM', 'L2 · PROGRAM DISTRIBUTION SYSTEM']) assert.match(source, new RegExp(layer.replace(/[·]/g, '\\·')))
  assert.doesNotMatch(source, /L3 · FU-LOCAL FRONTENDS/)
  for (const node of ['instruction-dma', 'response', 'assembler', 'word-fifo', 'elastic', 'relay-fabric', 'fu-entry']) assert.match(source, new RegExp(`'arch:control:program-load:${node}'`))
  for (const node of ['write', 'array', 'sequencer', 'config-fifo', 'reservoir', 'word-builder', 'prime-fifo', 'handoff-mux', 'decode', 'west', 'east']) assert.doesNotMatch(source, new RegExp(`'arch:control:program-load:${node}'[^\\n]+y:`))
  for (const node of ['retire', 'boundary']) assert.doesNotMatch(source, new RegExp(`'arch:control:program-load:${node}'[^\\n]+y:`))
  assert.match(source, /type: 'programStage'/)
  assert.match(source, /type: 'programLoad'/)
  assert.match(source, /layoutOrthogonalEdges\(boxes, programEdges/)
  assert.match(source, /Only real functional rectangles are routing obstacles/)
  assert.match(source, /large system\/layer[\s\S]+intentionally absent/)
  assert.match(source, /id\.includes\(':interface:main-'\)/)
  assert.match(source, /physicalEndpointId/)
  assert.match(source, /programRelayFabricId/)
  assert.match(app, /drillNodes=\{snapshot\.physicalArchitecture\.drilldown\.nodes\}/)
  assert.match(app, /drillInterfaces=\{snapshot\.physicalArchitecture\.drilldown\.interfaces\}/)
  assert.match(readme, /禁止使用斜线箭头/)
  assert.match(readme, /节点、接口标签、箭头头部、分组标题和说明文字不得互相覆盖/)
  assert.match(model, /Word FIFO Dequeue \+ Route Metadata/)
  assert.match(model, /Distributor Input Handshake/)
  assert.match(model, /program-relay-fabric/)
  assert.match(model, /Two RTL-confirmed seven-stage chains/)
  assert.match(model, /u_program_load_system is a direct top-level subsystem/)
  assert.match(model, /u_program_distribute_system is a direct top-level sibling/)
  assert.match(model, /SXM \/ VXM Program Boundary/)
  assert.match(model, /interface:endpoint-boundary/)
  assert.match(model, /R6 also forwards the outer MXM\/SXM record/i)
  assert.match(model, /Boundary Connected/)
  assert.match(model, /Endpoint Not Integrated/)
  assert.match(model, /Program Reset \/ Transport Flush/)
  assert.match(source, /blocked-boundary/)
  assert.match(model, /complete 165-bit record/)
  assert.match(model, /1-bit control domain contains only WRITE=0 and PRIME=1/)
  assert.match(model, /165-bit/)
})

test('primary physical topology removes obsolete Router cards and routes Program Load through the integrated Relay fabric', async () => {
  const [source, model] = await Promise.all([read('src/components/PhysicalArchitectureGraph.tsx'), read('server/physical-architecture-model.mjs')])
  assert.match(source, /if \(item\.direction === 'program-load' && \/\^physical:\(west\|east\):\//)
  assert.match(source, /return programRelayFabricId/)
  assert.match(source, /Relay Chain → FU Frontend \/ local iMEM/)
  assert.match(source, /Elastic Stage → VXM Boundary/)
  assert.doesNotMatch(source, /physical:control:(west-router|east-router)/)
  assert.doesNotMatch(model, /physical:control:(west-router|east-router)/)
  assert.doesNotMatch(model, /physical-interface:program:(west-branch|east-branch)/)
})

test('FU overview graphs keep nested RTL detail behind direct stage drilldown', async () => {
  const detail = await read('src/components/FunctionalBlockDetail.tsx')
  assert.match(detail, /\['mxm', 'sxm', 'vxm'\]\.includes\(block\.kind\)/)
  assert.match(detail, /directChildIds\.has\(item\.sourceNodeId\) && directChildIds\.has\(item\.destinationNodeId\)/)
  assert.match(detail, /interfaces: stageInterfaces/)
})

test('public snapshot loading bypasses stale CDN and browser caches', async () => {
  const app = await read('src/App.tsx')
  assert.match(app, /architecture-snapshot\.json\?v=\$\{Date\.now\(\)\}/)
  assert.match(app, /cache: 'no-store'/)
})

test('semantic interface aliases and interactive evidence popovers are shared by physical and functional graphs', async () => {
  const [physical, functional, popover, tooltip, semanticConfig, styles] = await Promise.all([
    read('src/components/PhysicalArchitectureGraph.tsx'),
    read('src/components/FunctionalConnectivityGraph.tsx'),
    read('src/components/InteractiveInterfaceLabel.tsx'),
    read('src/components/InterfaceEvidenceTooltip.tsx'),
    read('data/interface-semantics.json'),
    read('src/styles.css'),
  ])
  assert.match(physical, /interfaceSemanticPresentation/)
  assert.match(functional, /interfaceSemanticPresentation/)
  assert.match(physical, /InteractiveInterfaceLabel/)
  assert.match(functional, /InteractiveInterfaceLabel/)
  assert.match(popover, /setPinned/)
  assert.match(popover, /pointerdown/)
  assert.match(popover, /Escape/)
  assert.match(popover, /onMouseLeave=\{\(\) => \{ suppressReopen\.current = false; scheduleClose\(\) \}\}/)
  assert.match(tooltip, /rawConnections\.slice\(0, 8\)\.map/)
  assert.match(styles, /interface-evidence-tooltip/)
  const aliases = JSON.parse(semanticConfig).aliases
  assert.equal(aliases.find((item) => item.semantic_id === 'mxm-local-imem-load')?.display_name, 'MXM Local iMEM Load')
})

test('Bus Detail uses semantic display names, meanings and secondary RTL names', async () => {
  const [detail, presentation, styles] = await Promise.all([
    read('src/components/BusDetailView.tsx'),
    read('src/lib/signal-presentation.ts'),
    read('src/styles.css'),
  ])
  for (const name of ['Word Strobe / Mask', 'Scope / 12-bit Destination / iMEM Address', 'Program Word Payload', 'Handshake']) assert.match(presentation, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(presentation, /rtlName/)
  assert.match(presentation, /meaning/)
  assert.match(detail, /bus-signal-name/)
  assert.match(detail, /selectedSignalPresentation\.meaning/)
  assert.match(detail, /PROGRAM LOAD ROUTE CONTRACT/)
  assert.match(detail, /PROGRAM LOAD RELAY CONTRACT/)
  assert.match(detail, /one registered boundary with skid capacity/i)
  assert.match(detail, /Target initiation interval: II=1/)
  assert.match(styles, /interface-popover-anchor\.is-open/)
})

test('shared route requests declare plane, line style and routing lanes', async () => {
  const [engine, physical, functional] = await Promise.all([
    read('src/lib/graph-layout-engine.ts'),
    read('src/components/PhysicalArchitectureGraph.tsx'),
    read('src/components/FunctionalConnectivityGraph.tsx'),
  ])
  assert.match(engine, /lineStyle\?: 'solid' \| 'dashed'/)
  assert.match(engine, /solidDashedEdgeOverlaps/)
  assert.match(engine, /arrowArrowOverlaps/)
  assert.match(physical, /lineStyle: item\.plane === 'status'/)
  assert.match(functional, /routingLane: edgeIndex % 6/)
})
