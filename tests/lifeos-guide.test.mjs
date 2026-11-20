import test from 'node:test'
import assert from 'node:assert/strict'
import { answerLiveOS } from '../src/home/lifeosGuide.ts'

test('local guide answers app topics and unknown questions without reading user data', () => {
  for (const [question, topic] of [
    ['How do I add a task?', 'tasks'],
    ['Where is Journal?', 'journal'],
    ['How does Focus work?', 'focus'],
    ['What is Reflect?', 'reflect'],
    ['What are 3 questions?', 'reflect'],
    ['Change the dark theme', 'settings'],
  ]) assert.equal(answerLiveOS(question).topic, topic)
  assert.deepEqual(answerLiveOS('weather tomorrow').topic, undefined)
  assert.match(answerLiveOS('weather tomorrow').text, /Tasks, Journal, Focus, 3 questions, and Settings/)
})

test('guide follows the current step and switches topics on a new question', () => {
  const journal = answerLiveOS('Куда деть запись?')
  assert.equal(journal.context.topic, 'journal')
  assert.ok(journal.followUps.some(prompt => /папк/i.test(prompt)))
  const folder = answerLiveOS('А если папки ещё нет?', journal.context)
  assert.equal(folder.context.step, 'create')
  assert.ok(folder.steps.some(step => /New folder/.test(step)))

  const focus = answerLiveOS('Как начать фокус?', folder.context)
  assert.equal(focus.context.topic, 'focus')
  const pause = answerLiveOS('А как сделать паузу?', focus.context)
  assert.equal(pause.context.step, 'pause')
  assert.ok(pause.steps.some(step => /Pause/.test(step)))

  const navigation = answerLiveOS('How do I customize the bottom bar?', pause.context)
  assert.equal(navigation.context.topic, 'navigation')
  assert.ok(navigation.followUps.some(prompt => /theme/.test(prompt)))
})
