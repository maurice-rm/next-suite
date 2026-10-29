// The package ships no types; this declares the one function from its README.
declare module 'validate-npm-package-name' {
  type Result = {
    validForNewPackages: boolean
    validForOldPackages: boolean
    errors?: string[]
    warnings?: string[]
  }

  const validate: (name: string) => Result
  export default validate
}
