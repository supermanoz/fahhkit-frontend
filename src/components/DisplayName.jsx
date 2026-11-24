/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { DEFAULT_NAME, getDisplayName } from '../utils/playerName'

// A person's name as the game shows it (nickname, else real name, else
// "Runner") - see utils/playerName.js for the rule.
export default function DisplayName({ user, fallback = DEFAULT_NAME }) {
  return <>{getDisplayName(user, fallback)}</>
}
