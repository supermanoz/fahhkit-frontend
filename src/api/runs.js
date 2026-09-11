import { getJson, postJson, deleteJson } from './client'

export function getRuns() {
  return postJson('/v1/run/find', { pageNumber: 1, noOfRecords: 500 })
}

export function getRun(id) {
  return getJson(`/v1/run/${id}`)
}

export function createRun(data) {
  return postJson('/v1/run', data)
}

export function deleteRun(id) {
  return deleteJson(`/v1/run/${id}`)
}
