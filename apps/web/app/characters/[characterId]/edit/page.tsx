import { CharacterBuilderPage } from '../../character-builder-ui';

type EditCharacterPageProps = {
  params: Promise<{
    characterId: string;
  }>;
};

export default async function EditCharacterPage({
  params,
}: EditCharacterPageProps) {
  const { characterId } = await params;

  return <CharacterBuilderPage characterId={characterId} mode="edit" />;
}
