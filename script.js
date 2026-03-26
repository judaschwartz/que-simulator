let simInterval = null, cars = [], simRunning = false, simPaused = false
const REAL_DURATION_MS = 30000
const NUM_LANES = 3

function formatHourMin(simMinutes) {
  const h = Math.floor(simMinutes / 60)
  const m = Math.floor(simMinutes % 60)
  return `${h}:${String(m).padStart(2,'0')}`
}

function formatMinSec(simMinutes) {
  const totalSec = Math.round(simMinutes * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2,'0')}`
}

function getInputs() {
  if (!document.getElementById('duration').value.includes(':')) {
    document.getElementById('duration').value += ':00'
  }
  const parts = document.getElementById('duration').value.split(':')
  const durationMin = parseInt(parts[0]) * 60 + parseInt(parts[1])
  const speedPerHr = parseFloat(document.getElementById('speed').value)
  const numCars = parseInt(document.getElementById('numCars').value)
  const delayMin = parseFloat(document.getElementById('delay').value) || 0
  return { durationMin, speedPerHr, numCars, delayMin }
}

function generateArrivals(numCars, durationMin) {
  const times = [0, 0, 0, 0, 0, ...Array.from({length: numCars - 5}, () => Math.random() * durationMin)]
  times.sort((a, b) => a - b)
  return times
}

function scheduleLanes(arrivalTimes, processTimePerCar, delayMin, durationMin) {
  const laneAvailableAt = Array(NUM_LANES).fill(delayMin)
  const schedule = []
  let idleSimTime = 0

  for (let i = 0; i < arrivalTimes.length; i++) {
    const arrival = arrivalTimes[i]
    const earliestLane = laneAvailableAt.indexOf(Math.min(...laneAvailableAt))
    const minFree = Math.min(...laneAvailableAt)
    if (arrival > minFree && i > 0) {
      idleSimTime += Math.min(arrival, durationMin) - Math.max(minFree, 0)
      if (idleSimTime < 0) idleSimTime = 0
    }
    const canStart = Math.max(arrival, laneAvailableAt[earliestLane])
    const done = canStart + processTimePerCar
    laneAvailableAt[earliestLane] = done
    schedule.push({ arrival, canStart, done, waitTime: canStart - arrival })
  }

  return { schedule, idleSimTime: Math.max(0, idleSimTime) }
}

function computeResults(schedule, numCars, idleSimTime) {
  let maxSimTime = 0, maxQueue = 0, totalWaitTime = 0, maxWaitTime = 0
  const events = []

  for (const s of schedule) {
    totalWaitTime += s.waitTime
    if (s.waitTime > maxWaitTime) maxWaitTime = s.waitTime
    maxSimTime = Math.max(maxSimTime, s.done)
    events.push({ time: s.arrival, delta: 1 })
    events.push({ time: s.canStart, delta: -1 })
  }

  events.sort((a, b) => a.time - b.time || a.delta - b.delta)
  let queueSize = 0
  for (const ev of events) {
    queueSize += ev.delta
    if (queueSize > maxQueue) maxQueue = queueSize
  }

  return { maxSimTime, maxQueue, avgWait: totalWaitTime / numCars, maxWaitTime, idleSimTime }
}

function runOneSim(durationMin, speedPerHr, numCars, delayMin) {
  const arrivalTimes = generateArrivals(numCars, durationMin)
  const processTimePerCar = (60 / speedPerHr) * NUM_LANES
  const { schedule, idleSimTime } = scheduleLanes(arrivalTimes, processTimePerCar, delayMin, durationMin)
  return computeResults(schedule, numCars, idleSimTime)
}

function showFinalStats(stats, numCars, label) {
  document.getElementById('statWaiting').textContent = 0
  document.getElementById('statProcessing').textContent = 0
  document.getElementById('statDone').textContent = numCars
  document.getElementById('statMaxQueue').textContent = Math.round(stats.maxQueue)
  document.getElementById('statAvgWait').textContent = formatMinSec(stats.avgWait)
  document.getElementById('statMaxWait').textContent = formatMinSec(stats.maxWaitTime)
  document.getElementById('statIdleTime').textContent = formatMinSec(stats.idleSimTime)
  document.getElementById('progressBar').style.width = '100%'
  document.getElementById('progressText').textContent = label
  document.getElementById('simTime').textContent = formatHourMin(stats.maxSimTime)
  document.getElementById('simTotal').textContent = formatHourMin(stats.maxSimTime)
}

function averageStats() {
  const { durationMin, speedPerHr, numCars, delayMin } = getInputs()
  if (simRunning || !numCars || !durationMin || !speedPerHr ) return
  const RUNS = 100
  const totals = { maxSimTime: 0, maxQueue: 0, avgWait: 0, maxWaitTime: 0, idleSimTime: 0 }
  for (let r = 0; r < RUNS; r++) {
    const result = runOneSim(durationMin, speedPerHr, numCars, delayMin)
    for (const key in totals) totals[key] += result[key]
  }
  const avg = {}
  for (const key in totals) avg[key] = totals[key] / RUNS
  showFinalStats(avg, numCars, `📊 Average of ${RUNS} runs`)
}

function instantStats() {
  const { durationMin, speedPerHr, numCars, delayMin } = getInputs()
  if (simRunning || !numCars || !durationMin || !speedPerHr ) return
  showFinalStats(runOneSim(durationMin, speedPerHr, numCars, delayMin), numCars, '⚡ Instant result')
}

function startSimulation() {
  const { durationMin, speedPerHr, numCars, delayMin } = getInputs()
  if (simRunning || !numCars || !durationMin || !speedPerHr ) return
  simRunning = true
  document.getElementById('runBtn').style.display = 'none'
  document.getElementById('pauseBtn').style.display = 'inline-block'

  const arrivalTimes = generateArrivals(numCars, durationMin)
  const processTimePerCar = (60 / speedPerHr) * NUM_LANES

  cars = arrivalTimes.map((t, i) => ({
    id: i + 1, arrivalTime: t, startProcessTime: null, doneTime: null, state: 'pending'
  }))

  const { schedule } = scheduleLanes(arrivalTimes, processTimePerCar, delayMin, durationMin)
  const totalSimMinutes = Math.max(...schedule.map(s => s.done))
  document.getElementById('simTotal').textContent = formatHourMin(totalSimMinutes)

  const msPerSimMinute = REAL_DURATION_MS / totalSimMinutes
  const TICK_MS = 50
  const simMinutesPerTick = TICK_MS / msPerSimMinute

  let currentSimTime = 0
  let processorFreeAt = Array(NUM_LANES).fill(delayMin)
  let processingCars = Array(NUM_LANES).fill(null)
  let maxQueue = 0
  let totalWaitTime = 0
  let doneCount = 0
  let maxWaitTime = 0
  let idleSimTime = 0

  function tick() {
    if (simPaused) return
    currentSimTime += simMinutesPerTick
    for (const car of cars) {
      if (car.state === 'pending' && currentSimTime >= car.arrivalTime) {
        car.state = 'waiting'
      }
    }
    let changed = true
    while (changed) {
      changed = false
      for (let lane = 0; lane < NUM_LANES; lane++) {
        if (processingCars[lane] && currentSimTime >= processingCars[lane].doneTime) {
          processorFreeAt[lane] = processingCars[lane].doneTime
          processingCars[lane].state = 'done'
          processingCars[lane].waitTime = processingCars[lane].startProcessTime - processingCars[lane].arrivalTime
          doneCount++
          totalWaitTime += processingCars[lane].waitTime
          if (processingCars[lane].waitTime > maxWaitTime) maxWaitTime = processingCars[lane].waitTime
          processingCars[lane] = null
          changed = true
        }
      }
      for (let lane = 0; lane < NUM_LANES; lane++) {
        if (!processingCars[lane] && currentSimTime >= delayMin) {
          const next = cars.find(c => c.state === 'waiting')
          if (next) {
            next.state = 'processing'
            next.startProcessTime = Math.max(processorFreeAt[lane], next.arrivalTime)
            next.doneTime = next.startProcessTime + processTimePerCar
            processingCars[lane] = next
            if (currentSimTime >= next.doneTime) {
              changed = true
            }
          }
        }
      }
    }
    const waiting = cars.filter(c => c.state === 'waiting').length
    const processing = cars.filter(c => c.state === 'processing').length
    const done = cars.filter(c => c.state === 'done').length
    if (waiting > maxQueue) maxQueue = waiting
    if (waiting === 0 && durationMin > currentSimTime) idleSimTime += simMinutesPerTick
    document.getElementById('statWaiting').textContent = waiting
    document.getElementById('statProcessing').textContent = processing
    document.getElementById('statDone').textContent = done
    document.getElementById('statMaxQueue').textContent = maxQueue
    document.getElementById('statAvgWait').textContent = doneCount > 0 ? formatMinSec(totalWaitTime / doneCount) : '0:00'
    document.getElementById('statMaxWait').textContent = formatMinSec(maxWaitTime)
    document.getElementById('statIdleTime').textContent = formatMinSec(idleSimTime)
    const pct = Math.min(100, (currentSimTime / totalSimMinutes) * 100)
    document.getElementById('progressBar').style.width = pct + '%'
    document.getElementById('progressText').textContent = `${Math.round(pct)}%`
    document.getElementById('simTime').textContent = formatHourMin(Math.min(currentSimTime, totalSimMinutes))
    renderLanes()
    if (done >= numCars) {
      clearInterval(simInterval)
      simInterval = null
      simRunning = false
      document.getElementById('runBtn').style.display = 'inline-block'
      document.getElementById('pauseBtn').style.display = 'none'
      document.getElementById('progressText').textContent = '✅ Complete!'
      document.getElementById('progressBar').style.width = '100%'
      document.getElementById('simTime').textContent = formatHourMin(totalSimMinutes)
      renderLanes()
    }
  }
  simInterval = setInterval(tick, TICK_MS)
}

function togglePause() {
  simPaused = !simPaused
  document.getElementById('pauseBtn').textContent = simPaused ? '▶ Resume' : '⏸ Pause'
}

function renderLanes() {
  const waitingCars = cars.filter(c => c.state === 'waiting')
  const processingCars = cars.filter(c => c.state === 'processing')
  const doneCars = cars.filter(c => c.state === 'done')
  document.getElementById('queueLane').innerHTML = '<h3>🕐 Waiting in Queue (' + waitingCars.length + ')</h3>' +
    waitingCars.map(c => `<div class="car waiting"><span class="car-icon">🚗</span> Car #${c.id}</div>`).join('')
  document.getElementById('processLane').innerHTML = '<h3>⚙️ Being Processed (' + processingCars.length + ')</h3>' +
    processingCars.map(c => `<div class="car processing"><span class="car-icon">🔧</span> Car #${c.id}</div>`).join('')
  document.getElementById('doneLane').innerHTML = '<h3>✅ Completed (' + doneCars.length + ')</h3>' +
    doneCars.reverse().map(c => `<div class="car done"><span class="car-icon">✅</span> Car #${c.id} <span style="margin-left:auto;font-size:11px;opacity:0.8">waited ${formatMinSec(c.waitTime)}</span></div>`).join('')
}
