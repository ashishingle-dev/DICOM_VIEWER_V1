import test from 'node:test'
import assert from 'node:assert/strict'
import { isMprCapable, volumeIdForSeries } from './volumeUtils.ts'
import { parseImageOrientation, getPlaneLabel, getEdgeLabels } from './orientation.ts'
import type { SeriesRecord } from '../types/dicom.ts'

test('volumeIdForSeries generates deterministic volume ID', () => {
  const uid = '1.2.840.113619.2.55.3.1'
  const id = volumeIdForSeries(uid)
  assert.equal(id, `cornerstoneStreamingImageVolume:${uid}`)
})

test('isMprCapable returns true only when slices >= 3', () => {
  const dummySeries = (instanceCount: number, instancesLength = instanceCount): SeriesRecord => ({
    seriesInstanceUID: '1.2.3',
    seriesNumber: 1,
    seriesDescription: 'Test Series',
    modality: 'CT',
    instanceCount,
    instances: Array.from({ length: instancesLength }, (_, i) => ({
      sopInstanceUID: `1.2.3.${i + 1}`,
      instanceNumber: i + 1,
      fileName: `img_${i + 1}.dcm`,
    })),
  })

  // >= 3 slices: capable
  assert.equal(isMprCapable(dummySeries(3)), true)
  assert.equal(isMprCapable(dummySeries(50)), true)

  // < 3 slices: incapable
  assert.equal(isMprCapable(dummySeries(2)), false)
  assert.equal(isMprCapable(dummySeries(1)), false)
  assert.equal(isMprCapable(dummySeries(0)), false)

  // fallback to instanceCount if instances array is empty (unhydrated summary)
  const unhydrated = (count: number): SeriesRecord => ({
    seriesInstanceUID: '1.2.3',
    seriesNumber: 1,
    seriesDescription: 'Test',
    modality: 'MR',
    instanceCount: count,
    instances: [],
  })
  assert.equal(isMprCapable(unhydrated(5)), true)
  assert.equal(isMprCapable(unhydrated(1)), false)
})

test('orientation calculations recognize Axial, Coronal, Sagittal planes', () => {
  // Axial orientation (row along X/Left, col along Y/Posterior)
  const axialIop = [1, 0, 0, 0, 1, 0]
  assert.equal(getPlaneLabel(axialIop), 'Axial')
  const axialEdges = getEdgeLabels(axialIop)
  assert.deepEqual(axialEdges, {
    right: 'L',
    left: 'R',
    bottom: 'P',
    top: 'A',
  })

  // Coronal orientation (row along X/Left, col along Z/Head)
  const coronalIop = [1, 0, 0, 0, 0, 1]
  assert.equal(getPlaneLabel(coronalIop), 'Coronal')
  const coronalEdges = getEdgeLabels(coronalIop)
  assert.deepEqual(coronalEdges, {
    right: 'L',
    left: 'R',
    bottom: 'H',
    top: 'F',
  })

  // Sagittal orientation (row along Y/Posterior, col along Z/Head)
  const sagittalIop = [0, 1, 0, 0, 0, 1]
  assert.equal(getPlaneLabel(sagittalIop), 'Sagittal')
  const sagittalEdges = getEdgeLabels(sagittalIop)
  assert.deepEqual(sagittalEdges, {
    right: 'P',
    left: 'A',
    bottom: 'H',
    top: 'F',
  })

  // Invalid or empty orientation
  assert.equal(parseImageOrientation([]), null)
  assert.equal(getPlaneLabel(undefined), null)
  assert.equal(getEdgeLabels(undefined), null)
})
