import { getJson, postJson, deleteJson } from './client'

export function getRuns(pageNumber = 1, noOfRecords = 500) {
  return postJson('/v1/run/find', { pageNumber, noOfRecords })
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
