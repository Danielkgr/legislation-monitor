# Contributing

Thanks for wanting to help with Legislation Monitor.

This project is a working prototype that watches Commonwealth and Victorian legislation.  The tests run against synthetic HTML fixtures rather than the live registers, so a contribution should keep that separation clear.  The guidance below keeps changes safe and reviewable.

## Before you change anything

- Read the README and the code so your change fits what the project already is.
- Open an issue first to describe the change and why it is wanted.
- Say whether your change touches the scrapers, the diff engine, the briefs, or the database, so the reviewer knows where to look.

## Making the change

- Fork the repository and work on a branch off the default branch.
- Keep the change small, and explain the reasoning in the commit and the pull request.
- Reference the issue your change addresses, so the reasoning stays with the code.

## Tests and style

- Install dependencies with `npm install`.
- Run the tests with `npm test`, and the checks that CI runs with `npm run lint`, `npm run format:check`, and `npm run build`.
- Add a test for any behaviour you change or add, using synthetic fixtures rather than the live registers, and keep the suite green before you ask for a review.

## Be considerate

Treat everyone here with respect, and assume good faith in feedback.  Explain a change as helpfully as you would like yours explained, and flag any number your change moves rather than hiding it.
