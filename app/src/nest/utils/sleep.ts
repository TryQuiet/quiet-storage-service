export const sleep = async (time = 1000): Promise<void> => {
  // eslint-disable-next-line promise/avoid-new -- This is fine
  await new Promise<void>(resolve => {
    setTimeout((): void => {
      resolve()
    }, time)
  })
}
