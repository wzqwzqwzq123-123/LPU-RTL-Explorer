import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { layoutOrthogonalEdges, type EdgeRoutePlan, type GraphBox } from '../lib/graph-layout-engine'
import { interfaceSemanticPresentation } from '../lib/interface-semantics'
import FrontendStagePopover from './FrontendStagePopover'
import InteractiveInterfaceLabel from './InteractiveInterfaceLabel'
import type { ArchitectureDrillInterface, ArchitectureDrillNode, ConfigurationFrontend, ConfigurationFrontendStage, PhysicalFunctionalBlock, PhysicalInterface, PhysicalRegion, RawConnection } from '../types'

const ENGINEERING_NAVY = '#172b57'

interface PhysicalNodeData extends Record<string, unknown> {
  block?: PhysicalFunctionalBlock
  region?: PhysicalRegion
  programNode?: ArchitectureDrillNode
  programGroup?: { id: string; label: string; note: string; role: 'layer' | 'section' }
  frontend?: ConfigurationFrontend
  ownerBlock?: PhysicalFunctionalBlock
  selected: boolean
  rawHighlighted: boolean
}

interface PhysicalEdgeData extends Record<string, unknown> {
  interface: PhysicalInterface
  selected: boolean
  showLabel: boolean
  labelName: string
  labelSignalCount: number
  pairKey?: string
  sourceName: string
  destinationName: string
  rawConnections: RawConnection[]
  status: string
  onSelect: (id: string) => void
  route?: EdgeRoutePlan
}

interface ProgramLoadEdgeData extends Record<string, unknown> {
  interface: ArchitectureDrillInterface
  labelName: string
  selected: boolean
  onSelect: (id: string) => void
  route?: EdgeRoutePlan
}

interface FrontendControlEdgeData extends Record<string, unknown> {
  frontendId: ConfigurationFrontend['id']
}

type PhysicalGraphEdge = Edge<PhysicalEdgeData> | Edge<ProgramLoadEdgeData> | Edge<FrontendControlEdgeData>

const RegionFrame = memo(({ data }: NodeProps<Node<PhysicalNodeData>>) => (
  <div className={`physical-region-frame region-${data.region?.id}`}>
    <div>
      <span>{data.region?.name}</span>
      <small className={`status-pill status-${data.region?.placementStatus}`}>{data.region?.placementStatus}</small>
    </div>
    <p>{data.region?.id === 'control' ? 'CONTROL PLANE' : 'FUNCTIONAL TOPOLOGY REGION'}</p>
  </div>
))
RegionFrame.displayName = 'RegionFrame'

function DataHandles() {
  return <>
    <Handle type="source" position={Position.Left} id="left-source" className="physical-handle generic left" />
    <Handle type="target" position={Position.Left} id="left-target" className="physical-handle generic left" />
    <Handle type="source" position={Position.Right} id="right-source" className="physical-handle generic right" />
    <Handle type="target" position={Position.Right} id="right-target" className="physical-handle generic right" />
    <Handle type="source" position={Position.Top} id="top-source" className="physical-handle generic top" />
    <Handle type="target" position={Position.Top} id="top-target" className="physical-handle generic top" />
    <Handle type="source" position={Position.Bottom} id="bottom-source" className="physical-handle generic bottom" />
    <Handle type="target" position={Position.Bottom} id="bottom-target" className="physical-handle generic bottom" />
    <Handle type="source" position={Position.Left} id="source-left-east" className="physical-handle data-east upper left" />
    <Handle type="target" position={Position.Left} id="target-left-east" className="physical-handle data-east upper left" />
    <Handle type="source" position={Position.Right} id="source-right-east" className="physical-handle data-east upper right" />
    <Handle type="target" position={Position.Right} id="target-right-east" className="physical-handle data-east upper right" />
    <Handle type="source" position={Position.Left} id="source-left-west" className="physical-handle data-west lower left" />
    <Handle type="target" position={Position.Left} id="target-left-west" className="physical-handle data-west lower left" />
    <Handle type="source" position={Position.Right} id="source-right-west" className="physical-handle data-west lower right" />
    <Handle type="target" position={Position.Right} id="target-right-west" className="physical-handle data-west lower right" />
    <Handle type="target" position={Position.Bottom} id="target-control" className="physical-handle control bottom" />
    <Handle type="source" position={Position.Top} id="source-control" className="physical-handle control top" />
    <Handle type="source" position={Position.Right} id="source-right-control" className="physical-handle control right" />
    <Handle type="target" position={Position.Left} id="target-left-control" className="physical-handle control left" />
    <Handle type="source" position={Position.Bottom} id="source-bottom-control" className="physical-handle control bottom" />
    <Handle type="target" position={Position.Top} id="target-top-control" className="physical-handle control top" />
  </>
}

const FunctionalNode = memo(({ data }: NodeProps<Node<PhysicalNodeData>>) => {
  const item = data.block!
  if (item.kind === 'program-load-pipeline') return (
    <div className={`physical-block physical-program-load-overview kind-${item.kind} ${data.selected ? 'selected' : ''} ${data.rawHighlighted ? 'raw-highlighted' : ''}`} data-node-kind={item.kind} data-evidence-status={item.placementStatus} title={`${item.displayName}\n${item.function}\n${item.placementStatus}`}>
      <DataHandles />
      <div className="program-load-overview-title"><span>LPU_TOP DIRECT SUBSYSTEMS · RTL-CONFIRMED</span><strong>PROGRAM LOAD → PROGRAM DISTRIBUTION → FU CLUSTER</strong></div>
      <div className="program-load-overview-groups">
        <section className="program-load-command"><header>COMMAND &amp; DMA</header><div className="program-load-mini-graph">
          <div className="program-load-command-flow">
            <div className="program-load-command-row"><b>Host Command Write</b><i data-program-edge="descriptor-write">→</i><b>Descriptor Array · 32</b></div>
            <div className="program-load-command-drop"><span data-program-edge="descriptor-fetch">Descriptor Fetch / Command PC</span><i>↓</i></div>
            <div className="program-load-command-row"><b>Command PC / Sequencer</b><i data-program-edge="dma-command">→</i><b>Instruction DMA / Program Read Engine</b></div>
          </div>
          <div className="program-load-boundary-link" title="The RTL exposes a generic command/response contract. No AXI or C2C adapter is instantiated."><span data-program-edge="external-read">Program Read Request →</span><b>GENERIC DMA BOUNDARY</b><span className="program-load-return-lane">← Program Response Beats</span><small>AXI / C2C adapter not modeled</small></div>
          <small className="program-load-needs-review">BOUNDARY NEEDS REVIEW · lpu_top currently derives EAST/WEST Scope from Destination[11]; top-level BOTH input is not exposed.</small>
        </div></section>
        <div className="program-load-crossing command-to-reassembly" aria-label="Command and DMA to Instruction Reassembly interfaces">
          <span className="program-load-crossing-control" data-program-edge="image-context" title="Independent Scope[1:0], Destination[11:0], format, local iMEM base and image metadata">IMAGE CONTEXT + ROUTE METADATA <b>→</b></span>
          <span className="program-load-crossing-data" data-program-edge="dma-response" title="Buffered DMA response: 256-bit data, 32-bit keep, last, 8-bit ID and error">BUFFERED PROGRAM RESPONSE <b>→</b></span>
        </div>
        <section className="program-load-reassembly"><header>INSTRUCTION REASSEMBLY</header><div className="program-load-mini-graph">
          <div className="program-load-reassembly-inputs"><b>External Program Response Boundary</b><b>Image Context FIFO · 16</b></div>
          <div className="program-load-reassembly-lanes"><i data-program-edge="response-bytes">DATA / KEEP ↓</i><i data-program-edge="context-builder">ROUTE METADATA ↓</i></div>
          <div className="program-load-reassembly-build"><b>64-byte Reassembly Reservoir</b><i data-program-edge="program-word">→</i><b>96 / 128-bit Program Word Builder</b></div>
          <div className="program-load-reassembly-enqueue"><i data-program-edge="word-enqueue">↓</i><span>REASSEMBLED PROGRAM WORD + ROUTE METADATA</span></div>
          <b className="program-load-word-fifo">Reassembled Word FIFO · 8</b>
        </div></section>
        <div className="program-load-crossing reassembly-to-handoff" aria-label="Instruction Reassembly to RTL Handoff interface">
          <span className="program-load-crossing-data" data-program-edge="word-dequeue" title="164-bit stored record: 128-bit word, 4-bit strobe, 2-bit Scope, 12-bit Destination, 17-bit local iMEM address and last">REASSEMBLED WORD + ROUTE METADATA <b>→</b></span>
          <span className="program-load-crossing-return">← DEQUEUE READY</span>
        </div>
        <section className="program-load-handoff"><header>RTL HANDOFF</header><div className="program-load-mini-graph program-load-merge">
          <div className="program-load-merge-source"><b>WRITE Record</b><i data-program-edge="word-dequeue">↘ WRITE</i></div>
          <div className="program-load-merge-source"><b>Deferred PRIME Command FIFO</b><i data-program-edge="prime-select">↙ PRIME</i></div>
          <b className="program-load-merge-target">WRITE / PRIME Handoff Mux</b><i data-program-edge="distributor-input">↓</i><b>Distributor Input Elastic Stage · 2</b>
        </div></section>
        <div className="program-load-crossing handoff-to-distributor" aria-label="RTL Handoff to Program Load Distributor interface">
          <span className="program-load-crossing-control" data-program-edge="distributor-input" title="1-bit Control, 128-bit data, 4-bit strobe, Scope[1:0], Destination[11:0], 17-bit iMEM address and last">PROGRAM LOAD RECORD · 165 BIT <b>→</b></span>
          <span className="program-load-crossing-return">← INPUT READY</span>
        </div>
        <section className="program-load-distributor"><header>PROGRAM DISTRIBUTION SYSTEM</header><div className="program-load-mini-graph program-load-fork">
          <b>Scope Expansion + Destination Decode</b><i data-program-edge="hemisphere-decode">↓</i><div className="program-load-branches"><b>West Program Branch</b><b>East Program Branch</b></div>
          <div className="program-load-branch-forward"><span>West Record → W0–W6 → FU Frontend</span><span>East Record → E0–E6 → FU Frontend</span></div>
          <div className="program-load-return"><i data-program-edge="west-completion">↘ completion</i><i data-program-edge="east-completion">completion ↙</i></div><b>Dual-branch Retirement</b>
        </div></section>
      </div>
    </div>
  )
  return (
    <div className={`physical-block kind-${item.kind} ${data.selected ? 'selected' : ''} ${data.rawHighlighted ? 'raw-highlighted' : ''} ${!item.enabledByDefault ? 'inactive' : ''}`} data-node-kind={item.kind} data-evidence-status={item.placementStatus} title={`${item.displayName}\n${item.function}\n${item.rtlMappings.map((mapping) => mapping.moduleName).filter(Boolean).join(', ')}\n${item.placementStatus}\n${item.instanceCount} instance${item.instanceCount === 1 ? '' : 's'}`}>
      <DataHandles />
      <strong>{item.shortName}</strong>
    </div>
  )
})
FunctionalNode.displayName = 'FunctionalNode'

const PhysicalFrontendMarker = memo(({ data }: NodeProps<Node<PhysicalNodeData>>) => {
  const frontend = data.frontend!
  return <div className="physical-frontend-marker" data-status={frontend.status} title={`Open ${frontend.label} architecture`}>
    <Handle type="target" position={Position.Top} id="top-target" className="physical-frontend-handle top" />
    <strong>{frontend.fu.toUpperCase()} FRONTEND</strong>
    <span aria-hidden="true">＋</span>
    <Handle type="source" position={Position.Bottom} id="bottom-source" className="physical-frontend-handle bottom" />
  </div>
})
PhysicalFrontendMarker.displayName = 'PhysicalFrontendMarker'

interface FrontendLevelNodeData extends Record<string, unknown> {
  label: string
  status: string
  count?: number | null
  stage?: ConfigurationFrontend['variants'][number]['stages'][number]
  variantName?: string
  onOpenPipeline?: () => void
}

const FrontendVariantFrame = memo(({ data }: NodeProps<Node<FrontendLevelNodeData>>) => <section className="frontend-level-variant" data-status={data.status}>
  <header><strong>{data.label}</strong>{data.count != null && <span>×{data.count} / FU</span>}</header>
</section>)
FrontendVariantFrame.displayName = 'FrontendVariantFrame'

const FrontendStageNode = memo(({ data }: NodeProps<Node<FrontendLevelNodeData>>) => <div className="frontend-level-stage" data-status={data.status}>
  <Handle type="target" position={Position.Left} id="left-target" />
  <FrontendStagePopover stage={data.stage!} variantName={data.variantName!} instanceCount={data.count ?? null} onOpenPipeline={data.onOpenPipeline} />
  <Handle type="source" position={Position.Right} id="right-source" />
</div>)
FrontendStageNode.displayName = 'FrontendStageNode'

const frontendLevelNodeTypes = { frontendVariant: FrontendVariantFrame, frontendStage: FrontendStageNode }

interface FrontendPipelineNodeData extends Record<string, unknown> {
  label: string
  description: string
  boundary: string
  indexLabel: string
  endpoint?: 'input' | 'output'
  kind: 'decoder' | 'scheduler'
  stateMachine?: boolean
  tone?: 'main' | 'idle' | 'dictionary' | 'escape' | 'done' | 'fault' | 'fault-summary'
  annotation?: boolean
}

const FrontendPipelineStepNode = memo(({ data }: NodeProps<Node<FrontendPipelineNodeData>>) => <article
  className="frontend-pipeline-step"
  data-endpoint={data.endpoint ?? ''}
  data-pipeline-kind={data.kind}
  data-state-machine={data.stateMachine ? 'true' : 'false'}
  data-tone={data.tone ?? 'main'}
  data-annotation={data.annotation ? 'true' : 'false'}
>
  <Handle type="target" position={Position.Left} id="left-target" />
  {data.stateMachine && <Handle type="source" position={Position.Left} id="left-source" />}
  {data.stateMachine && <>
    <Handle type="target" position={Position.Top} id="top-target" style={{ left: '34%' }} />
    <Handle type="target" position={Position.Top} id="top-target-center" style={{ left: '50%' }} />
    <Handle type="source" position={Position.Top} id="top-source" style={{ left: '66%' }} />
    <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ left: '50%' }} />
    <Handle type="source" position={Position.Bottom} id="bottom-source-center" style={{ left: '50%' }} />
    <Handle type="source" position={Position.Bottom} id="bottom-source-left" style={{ left: '34%' }} />
    <Handle type="source" position={Position.Bottom} id="bottom-source-right" style={{ left: '66%' }} />
    <Handle type="target" position={Position.Right} id="right-target" />
  </>}
  {!data.stateMachine && <span>{data.indexLabel}</span>}
  <strong>{data.label}</strong>
  <p>{data.description}</p>
  {!data.stateMachine && <small>{data.boundary}</small>}
  <Handle type="source" position={Position.Right} id="right-source" />
</article>)
FrontendPipelineStepNode.displayName = 'FrontendPipelineStepNode'

const frontendPipelineNodeTypes = { frontendVariant: FrontendVariantFrame, frontendPipelineStep: FrontendPipelineStepNode }

function FrontendPipelineLevel({ frontend, variantName, stage, onBack }: { frontend: ConfigurationFrontend; variantName: string; stage: ConfigurationFrontendStage; onBack: () => void }) {
  const pipeline = stage.pipeline!
  const stateMachineFocus = pipeline.visualization === 'state-machine'
  const graph = useMemo(() => {
    if (pipeline.visualization === 'state-machine') {
      const frameId = `frontend-pipeline:${frontend.id}:${stage.id}`
      const frameWidth = 2620
      const frameHeight = 1350
      const nodes: Node<FrontendLevelNodeData | FrontendPipelineNodeData>[] = [{
        id: frameId,
        type: 'frontendVariant',
        position: { x: 50, y: 45 },
        style: { width: frameWidth, height: frameHeight, zIndex: -1 },
        draggable: false,
        selectable: false,
        data: { label: pipeline.stateBadge ?? 'RTL 状态转移', status: stage.status },
      }]
      for (const step of pipeline.steps) {
        const position = step.position ?? { x: 70, y: 100 }
        nodes.push({
          id: `${frameId}:${step.id}`,
          type: 'frontendPipelineStep',
          parentId: frameId,
          position: { x: position.x, y: position.y },
          style: { width: position.width ?? 230, height: position.height ?? 112, zIndex: step.annotation ? 1 : 3 },
          draggable: false,
          selectable: false,
          data: {
            label: step.name,
            description: step.description,
            boundary: step.boundary,
            indexLabel: '',
            kind: pipeline.kind,
            stateMachine: true,
            tone: step.tone,
            annotation: step.annotation,
          },
        })
      }
      const transitionNavy = '#102b59'
      const edges: Edge[] = (pipeline.transitions ?? []).map((transition) => {
        const tone = transition.tone ?? 'main'
        const color = transitionNavy
        return {
          id: `${frameId}:transition:${transition.id}`,
          source: `${frameId}:${transition.source}`,
          target: `${frameId}:${transition.target}`,
          sourceHandle: transition.sourceHandle ?? 'right-source',
          targetHandle: transition.targetHandle ?? 'left-target',
          type: 'smoothstep',
          pathOptions: { offset: transition.offset ?? 34, borderRadius: 8 },
          label: transition.label,
          labelShowBg: true,
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 3,
          labelBgStyle: { fill: '#fffdf8', fillOpacity: 0.96, stroke: color, strokeWidth: 1 },
          labelStyle: { fill: color, fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 12, fontWeight: 850 },
          className: `decoder-state-transition tone-${tone}`,
          style: { stroke: color, strokeWidth: 3, strokeDasharray: tone === 'fault' ? '9 6' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 12 },
          zIndex: tone === 'loop' || tone === 'fault' ? 1 : 2,
        }
      })
      return { nodes, edges }
    }
    const cardWidth = 250
    const cardGap = 86
    const frameLeft = 60
    const frameTop = 55
    const cards = [
      { id: 'input', label: 'Pipeline Input', description: pipeline.inputLabel, boundary: 'UPSTREAM READY / VALID', indexLabel: 'IN', endpoint: 'input' as const },
      ...pipeline.steps.map((step, index) => ({ ...step, label: step.name, indexLabel: String(index + 1).padStart(2, '0') })),
      { id: 'output', label: 'Pipeline Output', description: pipeline.outputLabel, boundary: 'DOWNSTREAM READY / VALID', indexLabel: 'OUT', endpoint: 'output' as const },
    ]
    const frameId = `frontend-pipeline:${frontend.id}:${stage.id}`
    const frameWidth = 100 + cards.length * cardWidth + Math.max(0, cards.length - 1) * cardGap
    const nodes: Node<FrontendLevelNodeData | FrontendPipelineNodeData>[] = [{
      id: frameId,
      type: 'frontendVariant',
      position: { x: frameLeft, y: frameTop },
      style: { width: frameWidth, height: 310, zIndex: -1 },
      draggable: false,
      selectable: false,
      data: { label: `${stage.name} · ${variantName}`, status: stage.status },
    }]
    const edges: Edge[] = []
    for (const [cardIndex, card] of cards.entries()) {
      const cardId = `${frameId}:${card.id}`
      nodes.push({
        id: cardId,
        type: 'frontendPipelineStep',
        parentId: frameId,
        position: { x: 42 + cardIndex * (cardWidth + cardGap), y: 82 },
        style: { width: cardWidth, height: 195, zIndex: 2 },
        draggable: false,
        selectable: false,
        data: { label: card.label, description: card.description, boundary: card.boundary, indexLabel: card.indexLabel, endpoint: 'endpoint' in card ? card.endpoint : undefined, kind: pipeline.kind },
      })
      if (cardIndex > 0) edges.push({
        id: `${frameId}:flow:${cardIndex - 1}:${cardIndex}`,
        source: `${frameId}:${cards[cardIndex - 1].id}`,
        target: cardId,
        sourceHandle: 'right-source',
        targetHandle: 'left-target',
        type: 'straight',
        className: 'frontend-level-edge frontend-pipeline-level-edge',
        style: { stroke: '#a46518', strokeWidth: 5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#a46518', width: 18, height: 13 },
      })
    }
    return { nodes, edges }
  }, [frontend.id, pipeline, stage.id, stage.name, stage.status, variantName])

  return <section className="physical-frontend-pipeline-level" data-frontend-level={frontend.id} data-pipeline-kind={pipeline.kind} data-status={stage.status} data-state-machine-focus={stateMachineFocus ? 'true' : 'false'}>
    {stateMachineFocus
      ? <header className="decoder-state-machine-heading"><button type="button" onClick={onBack}>← L2 {frontend.label}</button><h2>{pipeline.title}</h2></header>
      : <>
        <header>
          <button type="button" onClick={onBack}>← L2 {frontend.label}</button>
          <div><span>{pipeline.kind === 'decoder' ? 'MACRO → CONTEXT' : 'CONTEXT → BASE INSTRUCTION'}</span><h2>{stage.name}</h2></div>
          <strong>{`${pipeline.kind.toUpperCase()} PIPELINE`}</strong>
        </header>
        <div className="frontend-pipeline-level-summary">
          <p>{pipeline.summary}</p>
          <span>{pipeline.timingNote}</span>
        </div>
      </>}
    <div className="physical-frontend-pipeline-level-canvas">
      <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={frontendPipelineNodeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.25} maxZoom={2.2} fitView fitViewOptions={{ padding: 0.1, maxZoom: 1.05 }} proOptions={{ hideAttribution: true }} colorMode="light">
        <Background color="#cbd4e1" gap={28} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  </section>
}

function FrontendArchitectureLevel({ frontend, onBack, onFocusModeChange }: { frontend: ConfigurationFrontend; onBack: () => void; onFocusModeChange?: (active: boolean) => void }) {
  const [activePipeline, setActivePipeline] = useState<{ variantName: string; stage: ConfigurationFrontendStage } | null>(null)
  const stateMachineFocus = activePipeline?.stage.pipeline?.visualization === 'state-machine'
  useEffect(() => {
    onFocusModeChange?.(stateMachineFocus)
    return () => onFocusModeChange?.(false)
  }, [onFocusModeChange, stateMachineFocus])
  const graph = useMemo(() => {
    const stageWidth = 220
    const stageGap = 78
    const frameLeft = 70
    const frameTop = 60
    const rowGap = 245
    const nodes: Node<FrontendLevelNodeData>[] = []
    const edges: Edge[] = []
    for (const [variantIndex, variant] of frontend.variants.entries()) {
      const frameId = `frontend-level:${frontend.id}:${variant.id}`
      const frameWidth = Math.max(720, 100 + variant.stages.length * stageWidth + Math.max(0, variant.stages.length - 1) * stageGap)
      nodes.push({
        id: frameId,
        type: 'frontendVariant',
        position: { x: frameLeft, y: frameTop + variantIndex * rowGap },
        style: { width: frameWidth, height: 190, zIndex: -1 },
        draggable: false,
        selectable: false,
        data: { label: variant.name, status: variant.status, count: variant.count },
      })
      for (const [stageIndex, stage] of variant.stages.entries()) {
        const stageId = `${frameId}:${stage.id}`
        nodes.push({
          id: stageId,
          type: 'frontendStage',
          parentId: frameId,
          position: { x: 42 + stageIndex * (stageWidth + stageGap), y: 68 },
          style: { width: stageWidth, height: 92, zIndex: 2 },
          draggable: false,
          data: { label: stage.name, status: stage.status, stage, variantName: variant.name, count: variant.count, onOpenPipeline: stage.pipeline ? () => setActivePipeline({ variantName: variant.name, stage }) : undefined },
        })
        if (stageIndex > 0) {
          edges.push({
            id: `${frameId}:flow:${stageIndex - 1}:${stageIndex}`,
            source: `${frameId}:${variant.stages[stageIndex - 1].id}`,
            target: stageId,
            sourceHandle: 'right-source',
            targetHandle: 'left-target',
            type: 'straight',
            className: 'frontend-level-edge',
            style: { stroke: '#a46518', strokeWidth: 4 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#a46518', width: 16, height: 12 },
          })
        }
      }
    }
    return { nodes, edges }
  }, [frontend])

  if (activePipeline) return <FrontendPipelineLevel frontend={frontend} variantName={activePipeline.variantName} stage={activePipeline.stage} onBack={() => setActivePipeline(null)} />

  return <section className="physical-frontend-level" data-frontend-level={frontend.id} data-status={frontend.status}>
    <header>
      <button type="button" onClick={onBack}>← L1 Physical Architecture</button>
      <div><span>FRONTEND ARCHITECTURE</span><h2>{frontend.label}</h2></div>
      <strong>{frontend.status === 'rtl-confirmed' ? 'INTEGRATED' : 'INTEGRATION WIP'}</strong>
    </header>
    <div className="physical-frontend-level-canvas">
      <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={frontendLevelNodeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} onNodeClick={() => undefined} minZoom={0.3} maxZoom={2.2} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1.05 }} proOptions={{ hideAttribution: true }} colorMode="light">
        <Background color="#cbd4e1" gap={28} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  </section>
}

const PromotedProgramGroup = memo(({ data }: NodeProps<Node<PhysicalNodeData>>) => {
  const group = data.programGroup!
  return <div className={`physical-program-group group-${group.id} group-role-${group.role}`} data-program-group={group.id} title={group.note}>
    <header><strong>{group.label}</strong><span>{group.role === 'layer' ? 'RTL OWNERSHIP LAYER' : 'CONTROLLER INTERNAL STAGE'}</span></header>
  </div>
})
PromotedProgramGroup.displayName = 'PromotedProgramGroup'

function promotedProgramCategory(item: ArchitectureDrillNode) {
  const identity = `${item.nodeType} ${item.displayName}`.toLowerCase()
  if (/(fifo|queue|buffer|reservoir|elastic|array)/.test(identity)) return 'storage'
  if (/(boundary|interface|response)/.test(identity)) return 'interface'
  if (/(builder)/.test(identity)) return 'compute'
  return 'control'
}

const PromotedProgramNode = memo(({ data }: NodeProps<Node<PhysicalNodeData>>) => {
  const item = data.programNode!
  const category = promotedProgramCategory(item)
  if (item.nodeType === 'program-relay-fabric') {
    return <div className={`physical-program-stage physical-program-relay-fabric ${data.selected ? 'selected' : ''}`} data-program-node={item.id} data-evidence-status={item.confidenceStatus} title={`${item.displayName}\n${item.description}\n${item.confidenceStatus}`}>
      <DataHandles />
      <header><strong>RELAY CHAIN · WEST / EAST</strong><span>2 × 7 REGISTERED STAGES</span></header>
      <div className="physical-program-relay-row"><b>WEST</b><span>W0 → W1 → W2 → W3 → W4 → W5 → W6</span></div>
      <div className="physical-program-relay-row"><b>EAST</b><span>E0 → E1 → E2 → E3 → E4 → E5 → E6</span></div>
      <footer>14 MEM local ports · R6 outer MXM/SXM path · VXM bypasses Relay</footer>
    </div>
  }
  return <div className={`physical-program-stage category-${category} ${data.selected ? 'selected' : ''} ${data.rawHighlighted ? 'raw-highlighted' : ''}`} data-program-node={item.id} data-program-container={item.architectureContainer ?? ''} data-evidence-status={item.confidenceStatus} title={`${item.displayName}\n${item.description}\n${item.confidenceStatus}`}>
    <DataHandles />
    <strong>{item.displayName}</strong>
  </div>
})
PromotedProgramNode.displayName = 'PromotedProgramNode'

function ProgramLoadEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, data }: EdgeProps<Edge<ProgramLoadEdgeData>>) {
  const route = data?.route
  const path = route?.path ?? `M ${sourceX} ${sourceY} L ${targetX} ${sourceY} L ${targetX} ${targetY}`
  const labelX = route?.labelX ?? (sourceX + targetX) / 2
  const labelY = route?.labelY ?? (sourceY + targetY) / 2
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={24} className={`physical-program-edge plane-${data!.interface.plane} line-${route?.lineStyle ?? 'solid'} ${data?.selected ? 'selected' : ''}`} />
    <EdgeLabelRenderer><button
      type="button"
      className={`physical-program-edge-label plane-${data!.interface.plane}`}
      data-program-interface={data!.interface.id}
      data-route-lane={route?.routingLane}
      style={{ width: route?.labelWidth, transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
      onClick={(event) => { event.stopPropagation(); data!.onSelect(data!.interface.id) }}
    >{data!.labelName}</button></EdgeLabelRenderer>
  </>
}

function PhysicalBusEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, data }: EdgeProps<Edge<PhysicalEdgeData>>) {
  const item = data!.interface
  const region = item.id.includes(':west:') ? 'W' : item.id.includes(':east:') ? 'E' : 'C'
  const direction = item.direction === 'east-stream' ? 'E' : item.direction === 'west-stream' ? 'W' : item.direction === 'program-load' ? 'LOAD' : 'ISSUE'
  const route = data?.route
  const path = route?.path ?? `M ${sourceX} ${sourceY} L ${targetX} ${sourceY} L ${targetX} ${targetY}`
  const labelX = route?.labelX ?? (sourceX + targetX) / 2
  const labelY = route?.labelY ?? (sourceY + targetY) / 2
  const hasLeader = route && (Math.abs(route.labelAnchorX - labelX) > 1 || Math.abs(route.labelAnchorY - labelY) > 1)
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={28} className={`physical-bus directed-edge plane-${item.plane} direction-${item.direction} path-${item.pathKind} line-${route?.lineStyle ?? 'solid'} ${data?.selected ? 'selected' : ''}`} />
    {hasLeader && <BaseEdge id={`${id}-label-leader`} path={`M ${route.labelAnchorX} ${route.labelAnchorY} L ${labelX} ${labelY}`} interactionWidth={0} className={`interface-label-leader plane-${item.plane}`} />}
    {data?.showLabel && <EdgeLabelRenderer>
      <InteractiveInterfaceLabel
        className={`physical-bus-label interface-block plane-${item.plane} direction-${item.direction} ${data.pairKey ? 'bidirectional-interface' : ''} ${data.selected ? 'selected' : ''}`}
        dataAttributes={{ 'data-edge-id': item.id, 'data-interface-pair': data.pairKey, 'data-route-lane': route?.routingLane, 'data-line-style': route?.lineStyle }}
        style={{ width: route?.labelWidth, minHeight: route?.labelHeight, transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
        ariaLabel={`${item.name}，悬浮预览，点击固定`}
        semanticName={data.labelName}
        sourceName={data.sourceName}
        destinationName={data.destinationName}
        rawConnections={data.rawConnections}
        status={data.status}
        onOpenDetail={() => data.onSelect(item.id)}
      >
        {item.plane === 'data' && !data.pairKey && <span>{`${region}·${direction}`}</span>}
        <strong>{data.labelName}</strong>
      </InteractiveInterfaceLabel>
    </EdgeLabelRenderer>}
  </>
}

const nodeTypes = { region: RegionFrame, functional: FunctionalNode, frontendMarker: PhysicalFrontendMarker, programGroup: PromotedProgramGroup, programStage: PromotedProgramNode }
const edgeTypes = { physical: PhysicalBusEdge, programLoad: ProgramLoadEdge }

const regionLayout: Record<string, { x: number; y: number; width: number; height: number }> = {
  external: { x: 20, y: 25, width: 3620, height: 280 },
  control: { x: 20, y: 355, width: 3620, height: 1900 },
  west: { x: 20, y: 2305, width: 1350, height: 390 },
  central: { x: 1600, y: 2305, width: 400, height: 390 },
  east: { x: 2250, y: 2305, width: 1350, height: 390 },
}

const blockLayout: Record<string, { x: number; y: number; width: number; height: number }> = {
  'physical:west:mxm': { x: 30, y: 145, width: 270, height: 180 },
  'physical:west:sxm': { x: 540, y: 145, width: 270, height: 180 },
  'physical:west:mem': { x: 1050, y: 145, width: 270, height: 180 },
  'physical:central:vxm': { x: 50, y: 145, width: 300, height: 180 },
  'physical:east:mem': { x: 30, y: 145, width: 270, height: 180 },
  'physical:east:sxm': { x: 540, y: 145, width: 270, height: 180 },
  'physical:east:mxm': { x: 1050, y: 145, width: 270, height: 180 },
  'physical:external:instruction-ddr': { x: 180, y: 72, width: 430, height: 155 },
  'physical:external:program-bus': { x: 850, y: 72, width: 520, height: 155 },
  'physical:control:instruction-dma': { x: 260, y: 90, width: 360, height: 150 },
  'physical:control:qctl': { x: 3160, y: 1680, width: 360, height: 170 },
}

const programLoadLayerLayout = {
  controller: { x: 70, y: 70, width: 3450, height: 650, label: 'L1 · PROGRAM LOAD SYSTEM', note: 'DMA → response buffer → Assembler / Reassembler → Program Word FIFO.' },
  network: { x: 70, y: 770, width: 3450, height: 430, label: 'L2 · PROGRAM DISTRIBUTION SYSTEM', note: 'Elastic Stage → West/East Relay chains → FU frontend/local iMEM; VXM uses the direct Distributor bypass.' },
} as const

const programLoadNodeLayout: Record<string, { x: number; y: number; width: number; height: number }> = {
  'arch:control:program-load:instruction-dma': { x: 220, y: 330, width: 420, height: 125 },
  'arch:control:program-load:response': { x: 900, y: 330, width: 420, height: 125 },
  'arch:control:program-load:assembler': { x: 1580, y: 330, width: 480, height: 125 },
  'arch:control:program-load:word-fifo': { x: 2320, y: 330, width: 420, height: 125 },
  'arch:control:program-load:elastic': { x: 260, y: 920, width: 430, height: 125 },
  'arch:control:program-load:relay-fabric': { x: 980, y: 870, width: 1320, height: 220 },
  'arch:control:program-load:fu-entry': { x: 2660, y: 920, width: 520, height: 125 },
}

const programRelayFabricId = 'arch:control:program-load:relay-fabric'

interface Props {
  regions: PhysicalRegion[]
  blocks: PhysicalFunctionalBlock[]
  interfaces: PhysicalInterface[]
  drillNodes: ArchitectureDrillNode[]
  drillInterfaces: ArchitectureDrillInterface[]
  frontends: ConfigurationFrontend[]
  rawConnections: RawConnection[]
  selectedBlockId: string | null
  selectedInterfaceId: string | null
  selectedRawConnectionId: string | null
  planeFilter: 'all' | 'data' | 'control'
  signalQuery: string
  connectivityMode: boolean
  onOpenBlock: (id: string) => void
  onSelectInterface: (id: string) => void
  onSelectDrillInterface: (id: string) => void
  onFocusModeChange?: (active: boolean) => void
}

export default function PhysicalArchitectureGraph({ regions, blocks, interfaces, drillNodes, drillInterfaces, frontends, rawConnections, selectedBlockId, selectedInterfaceId, selectedRawConnectionId, planeFilter, signalQuery, connectivityMode, onOpenBlock, onSelectInterface, onSelectDrillInterface, onFocusModeChange }: Props) {
  const [activeFrontendId, setActiveFrontendId] = useState<ConfigurationFrontend['id'] | null>(null)
  const flowRef = useRef<ReactFlowInstance<Node<PhysicalNodeData>, PhysicalGraphEdge> | null>(null)
  const fitOptions = { padding: 0.06, maxZoom: 1.05 }
  useEffect(() => {
    let timer = 0
    const fit = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => flowRef.current?.fitView(fitOptions), 90)
    }
    window.addEventListener('resize', fit)
    return () => { window.removeEventListener('resize', fit); window.clearTimeout(timer) }
  }, [])
  const model = useMemo(() => {
    const programBlockId = 'physical:control:program-load'
    const programRootId = 'arch:control:program-load'
    const programBlock = blocks.find((block) => block.id === programBlockId)
    const frontendByFu = new Map<string, ConfigurationFrontend>(frontends.map((frontend) => [frontend.fu, frontend]))
    // FU-local frontend entry points are rendered directly above their MEM/MXM/SXM/VXM
    // blocks in the physical topology. Keep the detailed retire/boundary model in the
    // snapshot for drill-down evidence, but do not duplicate it as a separate L3 band.
    const programNodes = drillNodes.filter((node) => node.blockId === programBlockId && node.parentId === programRootId && programLoadNodeLayout[node.id])
    const programNodeIds = new Set(programNodes.map((node) => node.id))
    const programInterfaces = drillInterfaces.filter((item) => item.blockId === programBlockId && programNodeIds.has(item.sourceNodeId) && programNodeIds.has(item.destinationNodeId))
    const displayBlockId = (id: string) => id === 'physical:control:instruction-dma' ? programBlockId : id
    const rawHighlightedBlockIds = new Set<string>()
    if (selectedRawConnectionId) for (const item of interfaces) if (item.rawConnectionIds.includes(selectedRawConnectionId)) {
      rawHighlightedBlockIds.add(displayBlockId(item.sourceBlockId))
      rawHighlightedBlockIds.add(displayBlockId(item.destinationBlockId))
    }
    const nodes: Node<PhysicalNodeData>[] = regions.map((region) => ({
      id: `physical-region:${region.id}`,
      type: 'region',
      position: { x: regionLayout[region.id].x, y: regionLayout[region.id].y },
      style: { width: regionLayout[region.id].width, height: regionLayout[region.id].height, zIndex: -5 },
      draggable: false,
      selectable: false,
      data: { region, selected: false, rawHighlighted: false },
    }))
    if (programBlock) {
      for (const [id, group] of Object.entries(programLoadLayerLayout)) nodes.push({
        id: `${programRootId}:layer:${id}`,
        type: 'programGroup',
        parentId: 'physical-region:control',
        position: { x: group.x, y: group.y },
        style: { width: group.width, height: group.height, zIndex: -3 },
        draggable: false,
        selectable: false,
        data: { programGroup: { id: `layer-${id}`, label: group.label, note: group.note, role: 'layer' }, ownerBlock: programBlock, selected: selectedBlockId === programBlockId, rawHighlighted: rawHighlightedBlockIds.has(programBlockId) },
      })
      for (const item of programNodes) {
        const layout = programLoadNodeLayout[item.id]
        nodes.push({
          id: item.id,
          type: 'programStage',
          parentId: 'physical-region:control',
          position: { x: layout.x, y: layout.y },
          style: { width: layout.width, height: layout.height, zIndex: selectedBlockId === programBlockId ? 14 : 10 },
          draggable: false,
          data: { programNode: item, ownerBlock: programBlock, selected: selectedBlockId === programBlockId, rawHighlighted: rawHighlightedBlockIds.has(programBlockId) },
        })
      }
    }
    for (const item of blocks) {
      if (item.id === 'physical:control:instruction-dma' || item.id === programBlockId) continue
      const layout = blockLayout[item.id]
      if (!layout) continue
      nodes.push({
        id: item.id,
        type: 'functional',
        parentId: `physical-region:${item.regionId}`,
        position: { x: layout.x, y: layout.y },
        style: { width: layout.width, height: layout.height, zIndex: selectedBlockId === item.id || (selectedBlockId === 'physical:control:instruction-dma' && item.id === 'physical:control:program-load') ? 14 : 10 },
        draggable: false,
        data: { block: item, selected: selectedBlockId === item.id || (selectedBlockId === 'physical:control:instruction-dma' && item.id === 'physical:control:program-load'), rawHighlighted: rawHighlightedBlockIds.has(item.id) },
      })
      const frontend = frontendByFu.get(item.kind)
      if (frontend) {
        const markerWidth = Math.min(230, layout.width - 30)
        nodes.push({
          id: `physical-frontend:${item.id}`,
          type: 'frontendMarker',
          parentId: `physical-region:${item.regionId}`,
          position: { x: layout.x + (layout.width - markerWidth) / 2, y: 62 },
          style: { width: markerWidth, height: 58, zIndex: 12 },
          draggable: false,
          data: { frontend, ownerBlock: item, selected: false, rawHighlighted: false },
        })
      }
    }
    const query = signalQuery.trim().toLowerCase()
    const rawMap = new Map(rawConnections.map((raw) => [raw.id, raw]))
    const visible = interfaces.filter((item) => {
      if (item.id === 'physical-interface:program:dma-command' || item.id === 'physical-interface:program:dma-response') return false
      if (planeFilter !== 'all' && item.plane !== planeFilter) return false
      if (query && !`${item.name} ${item.direction} ${item.classificationBasis} ${item.rawConnectionIds.join(' ')}`.toLowerCase().includes(query)) return false
      return true
    })
    const blockById = new Map(blocks.map((block) => [block.id, block]))
    const physicalEndpointId = (item: PhysicalInterface, blockId: string) => {
      if (blockId === 'physical:control:instruction-dma') return 'arch:control:program-load:instruction-dma'
      const endpointBlock = blockById.get(blockId)
      if (blockId === item.destinationBlockId && endpointBlock && frontendByFu.has(endpointBlock.kind) && (item.direction === 'program-load' || item.direction === 'instruction-dispatch')) return `physical-frontend:${blockId}`
      if (blockId !== programBlockId) return blockId
      if (item.direction === 'program-load' && item.destinationBlockId === 'physical:central:vxm') return 'arch:control:program-load:elastic'
      if (item.direction === 'program-load' && /^physical:(west|east):/.test(item.destinationBlockId)) return programRelayFabricId
      return 'arch:control:program-load:fu-entry'
    }
    const globalLeft = (blockId: string) => {
      if (blockId === programBlockId || blockId === 'physical:control:instruction-dma') return regionLayout.control.x + programLoadNodeLayout['arch:control:program-load:instruction-dma'].x
      const block = blockById.get(blockId)
      const region = block ? regionLayout[block.regionId] : undefined
      const layout = blockLayout[blockId]
      return region && layout ? region.x + layout.x : 0
    }
    const pairKeyFor = (item: PhysicalInterface) => [item.sourceBlockId, item.destinationBlockId].sort().join('::')
    const pairSummary = new Map<string, { name: string; signalCount: number; rawConnectionIds: string[]; sourceName: string; destinationName: string }>()
    for (const item of visible) if (item.plane === 'data') {
      const key = pairKeyFor(item)
      const sourceFirst = globalLeft(item.sourceBlockId) <= globalLeft(item.destinationBlockId)
      const left = blockById.get(sourceFirst ? item.sourceBlockId : item.destinationBlockId)
      const right = blockById.get(sourceFirst ? item.destinationBlockId : item.sourceBlockId)
      const name = `${(left?.shortName ?? 'Module').replace(/\s*×\d+$/, '')}–${(right?.shortName ?? 'Module').replace(/\s*×\d+$/, '')} Interface`
      const previous = pairSummary.get(key)
      pairSummary.set(key, {
        name,
        signalCount: (previous?.signalCount ?? 0) + item.signalCount,
        rawConnectionIds: [...new Set([...(previous?.rawConnectionIds ?? []), ...item.rawConnectionIds])],
        sourceName: left?.displayName ?? 'Left endpoint',
        destinationName: right?.displayName ?? 'Right endpoint',
      })
    }
    const labelSeen = new Set<string>()
    const edges: Edge<PhysicalEdgeData>[] = visible.flatMap((item) => {
      const sourceId = physicalEndpointId(item, item.sourceBlockId)
      const targetId = physicalEndpointId(item, item.destinationBlockId)
      if (sourceId === targetId) return []
      const pairKey = item.plane === 'data' ? pairKeyFor(item) : undefined
      const labelKey = pairKey ? `pair:${pairKey}` : item.plane === 'control' ? `${item.destinationBlockId}:${item.direction}` : item.id
      const showLabel = !labelSeen.has(labelKey) && (connectivityMode || item.direction !== 'instruction-dispatch')
      labelSeen.add(labelKey)
      const summary = pairKey ? pairSummary.get(pairKey) : undefined
      const semantic = interfaceSemanticPresentation(item.id, item.name)
      const labelName = summary?.name ?? semantic.displayName
      const edgeColor = item.id === selectedInterfaceId ? '#c17823' : ENGINEERING_NAVY
      const endpointName = (blockId: string) => blockId === programBlockId && item.direction === 'program-load' && item.destinationBlockId === 'physical:central:vxm'
        ? 'Elastic Stage → VXM Boundary'
        : blockId === programBlockId && item.direction === 'program-load' && /^physical:(west|east):/.test(item.destinationBlockId)
        ? 'Relay Chain → FU Frontend / local iMEM'
        : blockById.get(blockId)?.displayName ?? blockId
      const sourceName = summary?.sourceName ?? endpointName(item.sourceBlockId)
      const destinationName = summary?.destinationName ?? endpointName(item.destinationBlockId)
      const rawIds = summary?.rawConnectionIds ?? item.rawConnectionIds
      return [{
        id: item.id,
        source: sourceId,
        target: targetId,
        type: 'physical',
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 8, color: edgeColor },
        data: {
          interface: item,
          selected: item.id === selectedInterfaceId,
          showLabel,
          labelName,
          labelSignalCount: summary?.signalCount ?? item.signalCount,
          pairKey,
          sourceName,
          destinationName,
          rawConnections: rawIds.map((id) => rawMap.get(id)).filter(Boolean) as RawConnection[],
          status: `${semantic.confidence ?? item.evidenceStatus} · ${item.pathKind}`,
          onSelect: onSelectInterface,
        },
        zIndex: item.id === selectedInterfaceId ? 4 : item.plane === 'control' ? 1 : 2,
      }]
    })
    // Only real functional rectangles are routing obstacles. The large system/layer
    // containers are intentionally absent so a connection may cross their background,
    // while it can never cut through Decoder, FIFO, Branch, Relay or FU rectangles.
    const boxes: GraphBox[] = blocks.flatMap((block) => {
      if (block.id === 'physical:control:instruction-dma' || block.id === programBlockId) return []
      const region = regionLayout[block.regionId]
      const layout = blockLayout[block.id]
      if (!region || !layout) return []
      const result: GraphBox[] = [{ id: block.id, x: region.x + layout.x, y: region.y + layout.y, width: layout.width, height: layout.height }]
      if (frontendByFu.has(block.kind)) {
        const markerWidth = Math.min(230, layout.width - 30)
        result.push({ id: `physical-frontend:${block.id}`, x: region.x + layout.x + (layout.width - markerWidth) / 2, y: region.y + 62, width: markerWidth, height: 58 })
      }
      return result
    })
    for (const item of programNodes) {
      const layout = programLoadNodeLayout[item.id]
      boxes.push({ id: item.id, x: regionLayout.control.x + layout.x, y: regionLayout.control.y + layout.y, width: layout.width, height: layout.height })
    }
    const routeHint = (item: PhysicalInterface) => {
      const localProgram = /physical-interface:control:(west|east):(mem|mxm):program/.test(item.id)
      const dispatch = item.direction === 'instruction-dispatch'
      const dmaRequest = item.id === 'physical-interface:dma:external-request'
      const dmaResponse = item.id === 'physical-interface:dma:external-response'
      const routingLane = item.id.includes(':west:') ? 0 : item.id.includes(':east:') ? 2 : item.plane === 'status' ? 4 : 1
      return {
        sourceSide: dmaRequest ? 'top' as const : dmaResponse ? 'bottom' as const : localProgram || dispatch ? 'bottom' as const : undefined,
        targetSide: dmaRequest ? 'bottom' as const : dmaResponse ? 'top' as const : localProgram || dispatch ? 'top' as const : undefined,
        routingLane,
      }
    }
    const plans = layoutOrthogonalEdges(boxes, edges.map((edge) => {
      const item = edge.data!.interface
      const hint = routeHint(item)
      return {
        id: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
        semanticName: edge.data!.pairKey ? 'link' : edge.data!.labelName,
        sourceSide: hint.sourceSide,
        targetSide: hint.targetSide,
        plane: item.plane,
        lineStyle: item.plane === 'status' || item.pathKind === 'processed-path' || item.pathKind === 'blocked-boundary' ? 'dashed' as const : 'solid' as const,
        routingLane: hint.routingLane,
        direction: item.direction,
      }
    }), { obstaclePadding: 30, channelSpacing: 30, labelClearance: 18, labelSpacing: 14, maxLabelWidth: 220, laneSearchCount: 5, canvasPadding: 300 })
    for (const edge of edges) {
      const plan = plans.get(edge.id)
      if (!plan) continue
      edge.sourceHandle = `${plan.sourceSide}-source`
      edge.targetHandle = `${plan.targetSide}-target`
      edge.data!.route = plan
      if (edge.data!.showLabel && edge.data!.pairKey) {
        const source = boxes.find((box) => box.id === edge.source)
        const target = boxes.find((box) => box.id === edge.target)
        if (source && target) {
          const sourceCenterX = source.x + source.width / 2
          const targetCenterX = target.x + target.width / 2
          plan.labelX = sourceCenterX <= targetCenterX ? (source.x + source.width + target.x) / 2 : (target.x + target.width + source.x) / 2
          plan.labelY = (source.y + source.height / 2 + target.y + target.height / 2) / 2
          plan.labelWidth = 152
          plan.labelHeight = 58
          plan.labelAnchorX = plan.labelX
          plan.labelAnchorY = plan.labelY
          plan.labelOffset = { x: 0, y: 0 }
        }
      }
    }
    const visibleProgramInterfaces = programInterfaces.filter((item) => {
      if (planeFilter !== 'all' && item.plane !== planeFilter) return false
      if (query && !`${item.name} ${item.category} ${item.direction}`.toLowerCase().includes(query)) return false
      return true
    })
    const programEdges: Edge<ProgramLoadEdgeData>[] = visibleProgramInterfaces.map((item) => ({
      id: item.id,
      source: item.sourceNodeId,
      target: item.destinationNodeId,
      type: 'programLoad',
      markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 7, color: item.plane === 'status' ? '#6b4e91' : ENGINEERING_NAVY },
      data: { interface: item, labelName: interfaceSemanticPresentation(item.id, item.name).displayName, selected: false, onSelect: onSelectDrillInterface },
      zIndex: item.plane === 'status' ? 2 : 3,
    }))
    const programRouteHint = (item: ArchitectureDrillInterface) => {
      const id = item.id
      if (id.includes(':interface:main-')) return { sourceSide: 'right' as const, targetSide: 'left' as const, routingLane: id.endsWith('vxm-direct') ? 3 : 0 }
      if (id.endsWith(':command-write') || id.endsWith(':dma-command') || id.endsWith(':dma-response') || id.endsWith(':reservoir-builder') || id.endsWith(':word-handoff')) return { sourceSide: 'right' as const, targetSide: 'left' as const, routingLane: 0 }
      if (id.endsWith(':context-enqueue')) return { sourceSide: 'top' as const, targetSide: 'top' as const, routingLane: 3 }
      if (id.endsWith(':descriptor-fetch') || id.endsWith(':response-reservoir') || id.endsWith(':context-builder') || id.endsWith(':word-enqueue') || id.endsWith(':prime-handoff') || id.endsWith(':elastic-handoff')) return { sourceSide: 'bottom' as const, targetSide: 'top' as const, routingLane: 1 }
      if (id.endsWith(':elastic-decode')) return { sourceSide: 'bottom' as const, targetSide: 'top' as const, routingLane: 0 }
      if (id.endsWith(':west')) return { sourceSide: 'left' as const, targetSide: 'top' as const, routingLane: 1 }
      if (id.endsWith(':east')) return { sourceSide: 'right' as const, targetSide: 'top' as const, routingLane: 2 }
      if (id.endsWith(':west-relay-chain')) return { sourceSide: 'right' as const, targetSide: 'left' as const, routingLane: 0 }
      if (id.endsWith(':east-relay-chain')) return { sourceSide: 'left' as const, targetSide: 'right' as const, routingLane: 0 }
      if (id.endsWith(':imem-write') || id.endsWith(':endpoint-boundary')) return { sourceSide: 'bottom' as const, targetSide: 'top' as const, routingLane: id.endsWith(':imem-write') ? 1 : 3 }
      if (id.endsWith(':commit')) return { sourceSide: 'left' as const, targetSide: 'left' as const, routingLane: 7 }
      if (id.endsWith(':start')) return { sourceSide: 'bottom' as const, targetSide: 'right' as const, routingLane: 6 }
      if (id.endsWith(':fault')) return { sourceSide: 'right' as const, targetSide: 'right' as const, routingLane: 11 }
      if (id.endsWith(':program-reset')) return { sourceSide: 'right' as const, targetSide: 'right' as const, routingLane: 13 }
      return { sourceSide: 'bottom' as const, targetSide: 'top' as const, routingLane: 4 }
    }
    const programPlans = layoutOrthogonalEdges(boxes, programEdges.map((edge, edgeIndex) => {
      const item = edge.data!.interface
      const hint = programRouteHint(item)
      return {
        id: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
        semanticName: edge.data!.labelName,
        sourceSide: hint.sourceSide,
        targetSide: hint.targetSide,
        plane: item.plane,
        lineStyle: item.plane === 'status' || item.confidenceStatus === 'needs-review' ? 'dashed' as const : 'solid' as const,
        routingLane: hint.routingLane ?? edgeIndex % 9,
      }
    }), { obstaclePadding: 40, channelSpacing: 44, labelClearance: 26, labelSpacing: 20, maxLabelWidth: 200, laneSearchCount: 17, canvasPadding: 420 })
    for (const edge of programEdges) {
      const plan = programPlans.get(edge.id)
      if (!plan) continue
      edge.sourceHandle = `${plan.sourceSide}-source`
      edge.targetHandle = `${plan.targetSide}-target`
      edge.data!.route = plan
    }
    const frontendEdges: Edge<FrontendControlEdgeData>[] = planeFilter === 'data' ? [] : blocks.flatMap<Edge<FrontendControlEdgeData>>((block) => {
      const frontend = frontendByFu.get(block.kind)
      if (!frontend || !blockLayout[block.id]) return []
      return [{
        id: `physical-frontend-control:${block.id}`,
        source: `physical-frontend:${block.id}`,
        target: block.id,
        sourceHandle: 'bottom-source',
        targetHandle: 'top-target',
        type: 'smoothstep',
        className: 'physical-frontend-control-edge',
        style: { stroke: '#a46518', strokeWidth: 4 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 10, color: '#a46518' },
        data: { frontendId: frontend.id },
        zIndex: 5,
      }]
    })
    return { nodes, edges: [...edges, ...programEdges, ...frontendEdges] }
  }, [regions, blocks, interfaces, drillNodes, drillInterfaces, frontends, rawConnections, selectedBlockId, selectedInterfaceId, selectedRawConnectionId, planeFilter, signalQuery, connectivityMode, onSelectInterface, onSelectDrillInterface])

  const activeFrontend = activeFrontendId == null ? null : frontends.find((frontend) => frontend.id === activeFrontendId) ?? null
  if (activeFrontend) return <FrontendArchitectureLevel frontend={activeFrontend} onBack={() => setActiveFrontendId(null)} onFocusModeChange={onFocusModeChange} />

  return <ReactFlow
    key={`${planeFilter}:${connectivityMode}`}
    nodes={model.nodes}
    edges={model.edges}
    nodeTypes={nodeTypes}
    edgeTypes={edgeTypes}
    nodesDraggable={false}
    nodesConnectable={false}
    onNodeClick={(_, node) => { const data = node.data as PhysicalNodeData; if (data.frontend) setActiveFrontendId(data.frontend.id); else if (data.programNode || data.programGroup) onOpenBlock('physical:control:program-load'); else if (data.block) onOpenBlock(node.id) }}
    onEdgeClick={(_, edge) => { if (edge.type === 'programLoad') onSelectDrillInterface(edge.id); else if (edge.type === 'physical') onSelectInterface(edge.id) }}
    minZoom={0.25}
    maxZoom={1.8}
    fitView
    fitViewOptions={fitOptions}
    onInit={(instance) => { flowRef.current = instance }}
    proOptions={{ hideAttribution: true }}
    className="engineering-graph physical-engineering-graph"
    colorMode="light"
  >
    <Background color="#cbd4e1" gap={28} size={1} />
    <MiniMap position="top-right" pannable zoomable nodeColor={(node) => (node.type === 'region' ? '#dce4ef' : '#9db3d2')} maskColor="rgba(230, 235, 242, .78)" />
    <Controls showInteractive={false} />
  </ReactFlow>
}
