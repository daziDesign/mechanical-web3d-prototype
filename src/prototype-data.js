export const parts = [
  {
    id: 'base',
    name: '基座',
    level: 'L0 / 固定基础',
    description: '承载整机重量，提供机械臂安装基准和坐标原点。',
    role: '作为整套装配流程的固定参考面。',
    stepName: '步骤 01：固定基座',
  },
  {
    id: 'turntable',
    name: '旋转台',
    level: 'L1 / 主旋转轴',
    description: '连接基座与上级结构，负责机械臂水平回转。',
    role: '把底座约束转换为可控转角，是装配运动的起点。',
    stepName: '步骤 02：安装旋转台',
  },
  {
    id: 'shoulder',
    name: '肩关节',
    level: 'L2 / 俯仰关节',
    description: '提供大臂俯仰自由度，决定末端大范围高度。',
    role: '承担主要载荷并连接上臂结构。',
    stepName: '步骤 03：锁定肩关节',
  },
  {
    id: 'upperArm',
    name: '上臂',
    level: 'L3 / 主连杆',
    description: '连接肩关节与肘关节，是机械臂主承力连杆。',
    role: '保证末端工作半径与结构刚度。',
    stepName: '步骤 04：装配上臂',
  },
  {
    id: 'elbow',
    name: '肘关节',
    level: 'L4 / 二级转轴',
    description: '连接上臂与前臂，提供二级姿态调节。',
    role: '扩展运动范围并改变末端姿态。',
    stepName: '步骤 05：安装肘部',
  },
  {
    id: 'forearm',
    name: '前臂',
    level: 'L5 / 末端连杆',
    description: '连接肘部与腕部，负责把运动传递到末端。',
    role: '稳定末端执行器的工作路径。',
    stepName: '步骤 06：安装前臂',
  },
  {
    id: 'wrist',
    name: '腕部',
    level: 'L6 / 姿态调节',
    description: '调节末端执行器姿态。',
    role: '让夹爪在装配或作业时保持正确角度。',
    stepName: '步骤 07：安装腕部',
  },
  {
    id: 'tool',
    name: '末端执行器',
    level: 'L7 / 作业工具',
    description: '执行夹取、定位和释放动作。',
    role: '完成最终装配或物料搬运动作。',
    stepName: '步骤 08：末端校准',
  },
];

export const assemblySteps = [
  { name: '初始检查', description: '完整机械臂', partId: null },
  { name: '固定基座', description: '建立装配基准', partId: 'base' },
  { name: '安装旋转台', description: '接入主轴', partId: 'turntable' },
  { name: '锁定肩关节', description: '连接承力节点', partId: 'shoulder' },
  { name: '装配上臂', description: '形成主轮廓', partId: 'upperArm' },
  { name: '安装肘部', description: '扩展运动链', partId: 'elbow' },
  { name: '安装前臂', description: '连接末端链路', partId: 'forearm' },
  { name: '安装腕部', description: '精调末端姿态', partId: 'wrist' },
  { name: '末端校准', description: '完成执行器', partId: 'tool' },
];

export const operationSteps = [
  { id: 'standby', name: '待命', description: '确认目标物料与传送带状态。', command: 'Standby' },
  { id: 'moveToTarget', name: '移动到目标', description: '机械臂转向并靠近当前物料。', command: 'Move to Target' },
  { id: 'grasp', name: '夹取物料', description: '锁定目标并闭合夹爪。', command: 'Clamp engaged' },
  { id: 'transfer', name: '搬运', description: '携带物料移动到传送带释放点。', command: 'Transfer' },
  { id: 'release', name: '释放物料', description: '打开夹爪并释放到传送带。', command: 'Payload released' },
  { id: 'returnHome', name: '复位', description: '机械臂回到待命姿态。', command: 'Reposition' },
];

export const operationPayloads = [
  { id: 'payloadA', name: '物料 A', lane: '近端料台', statusLabel: '待处理' },
  { id: 'payloadB', name: '物料 B', lane: '近端料台', statusLabel: '待处理' },
  { id: 'payloadC', name: '物料 C', lane: '远端料台', statusLabel: '待处理' },
];

export const gestureActions = [
  { type: 'rotate', label: '双手左右移动', behavior: '旋转视角' },
  { type: 'flip', label: '双手上下移动', behavior: '翻转视角' },
  { type: 'zoomIn', label: '双手外扩', behavior: '放大视角' },
  { type: 'zoomOut', label: '双手内收', behavior: '缩小视角' },
  { type: 'select', label: '食指指向', behavior: '选择零件' },
  { type: 'toggleAssembly', label: '双指点击', behavior: '进入装配验证' },
  { type: 'pause', label: '握拳', behavior: '暂停交互' },
];

export const partConstraints = {
  base: ['必须先完成坐标校准', '提供所有上层零件的安装基准'],
  turntable: ['依赖基座固定完成', '旋转轴需与基座中心对齐'],
  shoulder: ['依赖旋转台锁紧', '俯仰轴方向需与上臂连接孔一致'],
  upperArm: ['依赖肩关节安装完成', '装配前需确认承力面方向'],
  elbow: ['依赖上臂安装完成', '二级转轴需保持同轴约束'],
  forearm: ['依赖肘关节安装完成', '末端连杆方向影响腕部姿态'],
  wrist: ['依赖前臂安装完成', '需要完成末端姿态精调'],
  tool: ['依赖腕部安装完成', '末端执行器完成后进入整机校验'],
};

export const calibrationMetrics = [
  { label: '识别置信度', value: '92%', tone: 'good' },
  { label: '输入延迟', value: '38ms', tone: 'good' },
  { label: '误触阈值', value: '0.18', tone: 'normal' },
  { label: '缩放灵敏度', value: '1.08x', tone: 'normal' },
];
